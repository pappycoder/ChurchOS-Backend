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
import {
  SUBSCRIPTION_PLANS,
  subscriptionEnd,
  BillingCycle,
  PLAN_RANK,
  PLAN_CAPACITIES,
} from './plans';
import { churchEntitlements } from './entitlements';
import { Prisma, SubscriptionPlan } from '@prisma/client';
import {
  SubscriptionPricingService,
  convertedPrice,
  LockedQuote,
} from './subscription-pricing.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paystack: PaystackService,
    private readonly flutterwave: FlutterwaveService,
    private readonly pricing: SubscriptionPricingService,
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

  pricingCatalog(currency: string) {
    return this.pricing.catalog(currency);
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
        currency: true,
        checkout_url: true,
        created_at: true,
      },
    });
    const entitlement = await churchEntitlements(this.prisma, churchId);
    const [members, staff, locations, pendingInvitations, payments] = await Promise.all([
      this.prisma.member.count({ where: { church_id: churchId, archived_at: null } }),
      this.prisma.profile.count({
        where: {
          church_id: churchId,
          archived_at: null,
          status: 'active',
          NOT: { role: { isEmpty: true } },
        },
      }),
      this.prisma.branch.count({ where: { church_id: churchId, archived_at: null } }),
      this.prisma.staffInvitationReservation.count({
        where: { church_id: churchId, expires_at: { gt: new Date() } },
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { church_id: churchId },
        orderBy: { created_at: 'desc' },
        take: 50,
        select: {
          reference: true,
          plan: true,
          cycle: true,
          amount: true,
          currency: true,
          pricing_snapshot: true,
          status: true,
          intent: true,
          application_status: true,
          created_at: true,
          verified_at: true,
        },
      }),
    ]);
    return {
      baseCurrency: 'USD',
      gatewayCurrencies: {
        paystack: this.pricing.gatewayCurrencies('paystack'),
        flutterwave: this.pricing.gatewayCurrencies('flutterwave'),
      },
      catalog: Object.entries(SUBSCRIPTION_PLANS).map(([id, pricing]) => ({
        id,
        ...pricing,
        limits: PLAN_CAPACITIES[id as keyof typeof PLAN_CAPACITIES],
      })),
      limits: entitlement.limits,
      features: entitlement.features,
      usage: { members, staff: staff + pendingInvitations, locations, pendingInvitations },
      payments,
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
            currency: latestPayment.currency,
          }
        : null,
    };
  }

  private calculateQuote(
    current: {
      plan: SubscriptionPlan;
      cycle: BillingCycle;
      paid_until: Date | null;
      period_started_at?: Date | null;
      scheduled_plan?: SubscriptionPlan | null;
    },
    plan: Exclude<SubscriptionPlan, 'enterprise'>,
    cycle: BillingCycle,
  ) {
    const now = new Date();
    const active = !!(current.paid_until && current.paid_until > now);
    const price = SUBSCRIPTION_PLANS[plan][cycle];
    if (!active)
      return {
        intent: 'renewal',
        amount: price,
        effectiveAt: now,
        renewBy: subscriptionEnd(now, cycle),
        credit: 0,
      };
    if (current.plan === plan)
      throw new ConflictException(
        'Your subscription is already active. Renew after the current period ends.',
      );

    if (current.plan === 'enterprise' || PLAN_RANK[plan] <= PLAN_RANK[current.plan])
      throw new ConflictException('Schedule a downgrade for your next renewal.');
    if (cycle !== current.cycle)
      throw new ConflictException('Keep your current billing period for an immediate upgrade.');
    const start = current.period_started_at
      ? new Date(current.period_started_at)
      : new Date(current.paid_until!);
    if (!current.period_started_at) {
      const day = start.getUTCDate();
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() - (cycle === 'annual' ? 12 : 1));
      start.setUTCDate(
        Math.min(
          day,
          new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate(),
        ),
      );
    }
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (current.paid_until!.getTime() - now.getTime()) /
          (current.paid_until!.getTime() - start.getTime()),
      ),
    );
    const amount = Math.max(0.000001, (price - SUBSCRIPTION_PLANS[current.plan][cycle]) * fraction);
    return {
      intent: 'upgrade',
      amount,
      effectiveAt: now,
      renewBy: current.paid_until!,
      credit: Math.floor(SUBSCRIPTION_PLANS[current.plan][cycle] * fraction),
    };
  }
  async quote(churchId: string, dto: CheckoutDto) {
    const current = await this.prisma.platformSubscription.findUniqueOrThrow({
      where: { church_id: churchId },
    });
    const currency = dto.currency || 'USD';
    this.pricing.assertGatewayCurrency(dto.gateway, currency);
    const calculated = this.calculateQuote(current, dto.plan, dto.cycle);
    const exchange = await this.pricing.exchange(currency);
    const payload: LockedQuote = {
      plan: dto.plan,
      cycle: dto.cycle,
      gateway: dto.gateway,
      currency,
      intent: calculated.intent,
      amount: convertedPrice(calculated.amount, exchange.rate),
      usdAmount: calculated.amount,
      exchangeRate: exchange.rate,
      rateUpdatedAt: exchange.updatedAt,
      effectiveAt: calculated.effectiveAt.toISOString(),
      renewBy: calculated.renewBy.toISOString(),
      credit: calculated.credit,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      base: {
        plan: current.plan,
        cycle: current.cycle,
        paidUntil: current.paid_until?.toISOString() ?? null,
        periodStartedAt: current.period_started_at?.toISOString() ?? null,
      },
    };
    const quoteId = await this.pricing.saveQuote(churchId, payload);
    return { ...payload, quoteId };
  }
  async schedule(
    churchId: string,
    plan: Exclude<SubscriptionPlan, 'enterprise'> | null,
    cycle?: BillingCycle,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM churches WHERE id=${churchId} FOR UPDATE`;
      const current = await tx.platformSubscription.findUniqueOrThrow({
        where: { church_id: churchId },
      });
      if (
        await tx.subscriptionPayment.findFirst({
          where: { church_id: churchId, status: 'pending' },
        })
      )
        throw new ConflictException('Complete your pending checkout first.');
      if (
        plan &&
        (PLAN_RANK[plan] > PLAN_RANK[current.plan] ||
          !current.paid_until ||
          current.paid_until <= new Date())
      )
        throw new BadRequestException('Choose a downgrade for an active subscription.');
      await tx.platformSubscription.update({
        where: { church_id: churchId },
        data: { scheduled_plan: plan, scheduled_cycle: plan ? (cycle ?? current.cycle) : null },
      });
    });
    return this.status(churchId);
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
        if (
          pending.plan !== dto.plan ||
          pending.cycle !== dto.cycle ||
          pending.gateway !== dto.gateway ||
          (dto.currency !== undefined && pending.currency !== dto.currency)
        )
          throw new ConflictException(
            'Complete the existing pending checkout before selecting another plan.',
          );
        const snapshot = pending.pricing_snapshot as { quoteId?: string } | null;
        if (dto.quoteId && snapshot?.quoteId !== dto.quoteId)
          throw new ConflictException(
            'Another checkout is pending. Refresh Plan & Billing to review its amount before resuming.',
          );
        if (pending.checkout_url) return pending;
        throw new ConflictException('A checkout is being prepared. Please retry shortly.');
      }
      const quote = await this.pricing.getQuote(churchId, dto.quoteId);
      const currency = dto.currency || 'USD';
      this.pricing.assertGatewayCurrency(dto.gateway, currency);
      if (
        quote.plan !== dto.plan ||
        quote.cycle !== dto.cycle ||
        quote.gateway !== dto.gateway ||
        quote.currency !== currency
      )
        throw new BadRequestException(
          'This quote belongs to a different plan, currency or gateway. Review a fresh quote.',
        );
      if (
        quote.base.plan !== subscription.plan ||
        quote.base.cycle !== subscription.cycle ||
        quote.base.paidUntil !== (subscription.paid_until?.toISOString() ?? null) ||
        quote.base.periodStartedAt !== (subscription.period_started_at?.toISOString() ?? null)
      )
        throw new ConflictException('Your subscription changed. Review a fresh payment quote.');
      // Validate the entitlement transition again under the church lock; charge the frozen price.
      this.calculateQuote(subscription, dto.plan, dto.cycle);
      return tx.subscriptionPayment.create({
        data: {
          church_id: churchId,
          reference: `COSUB_${randomBytes(16).toString('hex')}`,
          gateway: dto.gateway,
          plan: dto.plan,
          cycle: dto.cycle,
          amount: quote.amount,
          intent: quote.intent,
          base_plan: subscription.plan,
          base_paid_until: subscription.paid_until,
          target_paid_until: quote.intent === 'upgrade' ? subscription.paid_until : null,
          currency,
          pricing_snapshot: { ...quote, quoteId: dto.quoteId } as unknown as Prisma.InputJsonValue,
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
        { callbackUrl: callback, currency: attempt.currency },
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
      const current = await tx.platformSubscription.findUniqueOrThrow({
        where: { church_id: churchId },
      });
      const staleUpgrade =
        (!!payment.base_plan &&
          (current.plan !== payment.base_plan ||
            current.paid_until?.getTime() !== payment.base_paid_until?.getTime())) ||
        (payment.intent === 'upgrade' && (!current.paid_until || current.paid_until <= new Date()));
      const claimed = await tx.subscriptionPayment.updateMany({
        where: { reference, church_id: churchId, status: { not: 'success' } },
        data: {
          status: 'success',
          verified_at: new Date(),
          checkout_url: null,
          application_status: staleUpgrade ? 'review' : 'applied',
        },
      });
      if (!claimed.count || staleUpgrade) return;
      const start =
        current.paid_until && current.paid_until > new Date() ? current.paid_until : new Date();
      await tx.platformSubscription.update({
        where: { church_id: churchId },
        data: {
          plan: payment.plan,
          cycle: payment.cycle,
          paid_until:
            payment.intent === 'upgrade'
              ? payment.target_paid_until
              : subscriptionEnd(start, payment.cycle as BillingCycle),
          ...(payment.intent === 'upgrade' ? {} : { period_started_at: start }),
          scheduled_plan: null,
          scheduled_cycle: null,
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
