import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../giving/services/paystack.service';
import { FlutterwaveService } from '../giving/services/flutterwave.service';
import { PaymentGatewayProvider } from '../giving/services/payment-gateway.interface';
import { CheckoutDto } from './billing.dto';
import { SUBSCRIPTION_PLANS, subscriptionEnd, BillingCycle } from './plans';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paystack: PaystackService,
    private readonly flutterwave: FlutterwaveService,
  ) {}

  private gateway(name: string): PaymentGatewayProvider {
    const gateway =
      name === 'paystack' ? this.paystack : name === 'flutterwave' ? this.flutterwave : null;
    if (!gateway?.isConfigured())
      throw new ServiceUnavailableException(
        'Subscription checkout is unavailable for this gateway. Please choose another or contact ChurchOS.',
      );
    return gateway;
  }

  async status(churchId: string) {
    const subscription = await this.prisma.platformSubscription.findUnique({
      where: { church_id: churchId },
    });
    const latestPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { church_id: churchId, status: 'pending' },
      orderBy: { created_at: 'desc' },
      select: {
        reference: true,
        gateway: true,
        plan: true,
        cycle: true,
        amount: true,
        checkout_url: true,
        created_at: true,
      },
    });
    return {
      subscription,
      active: !!(subscription?.paid_until && subscription.paid_until > new Date()),
      gateways: [this.paystack, this.flutterwave]
        .filter((g) => g.isConfigured())
        .map((g) => g.name),
      latestPayment: latestPayment
        ? {
            reference: latestPayment.reference,
            gateway: latestPayment.gateway,
            plan: latestPayment.plan,
            cycle: latestPayment.cycle,
            amount: latestPayment.amount,
          }
        : null,
    };
  }

  async checkout(churchId: string, email: string, dto: CheckoutDto) {
    const gateway = this.gateway(dto.gateway);
    const callback = new URL('/subscription', this.config.getOrThrow<string>('WEB_URL')).href;
    // Lock only our local ledger; provider I/O runs outside the transaction.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM churches WHERE id = ${churchId} FOR UPDATE`;
      const subscription = await tx.platformSubscription.upsert({
        where: { church_id: churchId },
        create: { church_id: churchId, plan: dto.plan, cycle: dto.cycle },
        update: {},
      });
      if (subscription.paid_until && subscription.paid_until > new Date())
        throw new ConflictException(
          'Your subscription is already active. Renew after the current period ends.',
        );
      // One payable attempt per church prevents two tabs buying overlapping periods.
      // A terminated API invocation must not leave checkout permanently locked.
      await tx.subscriptionPayment.updateMany({
        where: {
          church_id: churchId,
          status: 'pending',
          checkout_url: null,
          created_at: { lt: new Date(Date.now() - 120000) },
        },
        data: { status: 'failed' },
      });
      const pending = await tx.subscriptionPayment.findFirst({
        where: { church_id: churchId, status: 'pending' },
      });
      if (pending) {
        if (pending.checkout_url) return pending;
        throw new ConflictException('A checkout is being prepared. Please retry shortly.');
      }
      return tx.subscriptionPayment.create({
        data: {
          church_id: churchId,
          reference: `COSUB_${randomBytes(16).toString('hex')}`,
          gateway: dto.gateway,
          plan: dto.plan,
          cycle: dto.cycle,
          amount: SUBSCRIPTION_PLANS[dto.plan][dto.cycle],
          currency: 'NGN',
          status: 'pending',
        },
      });
    });
    if (attempt.checkout_url)
      return { authorizationUrl: attempt.checkout_url, reference: attempt.reference };
    try {
      const result = await gateway.initializeTransaction(
        email,
        attempt.amount,
        attempt.reference,
        { purpose: 'churchos_subscription', churchId },
        { callbackUrl: callback },
      );
      const url = new URL(result.authorizationUrl);
      const hosts =
        dto.gateway === 'paystack'
          ? ['checkout.paystack.com']
          : ['checkout.flutterwave.com', 'ravemodal.flutterwave.com'];
      if (
        result.reference !== attempt.reference ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !hosts.includes(url.hostname)
      )
        throw new ServiceUnavailableException('The payment provider returned an invalid checkout.');
      await this.prisma.subscriptionPayment.update({
        where: { reference: attempt.reference },
        data: { checkout_url: url.href },
      });
      return { authorizationUrl: url.href, reference: attempt.reference };
    } catch (error) {
      // No checkout URL was handed to the browser. Release the local slot;
      // a late signed success still reconciles through verify, even for this attempt.
      await this.prisma.subscriptionPayment.updateMany({
        where: { reference: attempt.reference, status: 'pending' },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  async verify(churchId: string, reference: string) {
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { reference, church_id: churchId },
    });
    if (!payment) throw new NotFoundException('Subscription payment not found');
    if (payment.status === 'success') return this.status(churchId);
    const verified = await this.gateway(payment.gateway).verifyTransaction(reference);
    if (
      verified.reference !== reference ||
      verified.currency !== payment.currency ||
      !Number.isFinite(verified.amount) ||
      verified.amount * 100 !== payment.amount * 100
    )
      throw new BadRequestException(
        'Payment details do not match this subscription. Contact ChurchOS with your reference.',
      );
    if (verified.status !== 'success') {
      if (verified.status === 'failed' || verified.status === 'reversed')
        await this.prisma.subscriptionPayment.updateMany({
          where: { reference, church_id: churchId, status: 'pending' },
          data: { status: verified.status },
        });
      return this.status(churchId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM churches WHERE id = ${churchId} FOR UPDATE`;
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { reference, church_id: churchId, status: { not: 'success' } },
        data: { status: 'success', verified_at: new Date(), checkout_url: null },
      });
      if (!claimed.count) return;
      const current = await tx.platformSubscription.findUniqueOrThrow({
        where: { church_id: churchId },
      });
      const start =
        current.paid_until && current.paid_until > new Date() ? current.paid_until : new Date();
      await tx.platformSubscription.update({
        where: { church_id: churchId },
        data: {
          plan: payment.plan,
          cycle: payment.cycle,
          paid_until: subscriptionEnd(start, payment.cycle as BillingCycle),
        },
      });
    });
    return this.status(churchId);
  }

  async webhook(name: string, raw: string, signature: string) {
    const gateway = this.gateway(name);
    if (!gateway.validateWebhookSignature(raw, signature))
      throw new UnauthorizedException('Invalid payment signature');
    const event = gateway.parseWebhookEvent(raw);
    if (!/^COSUB_[a-f0-9]{32}$/.test(event.reference)) return { received: true };
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { reference: event.reference },
    });
    if (payment && payment.gateway === name)
      await this.verify(payment.church_id, payment.reference);
    return { received: true };
  }
}
