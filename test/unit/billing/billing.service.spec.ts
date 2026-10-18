import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { CheckoutDto } from '../../../src/billing/billing.dto';
import { BillingService } from '../../../src/billing/billing.service';
import { subscriptionEnd, SUBSCRIPTION_PLANS } from '../../../src/billing/plans';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { PaystackService } from '../../../src/giving/services/paystack.service';
import { FlutterwaveService } from '../../../src/giving/services/flutterwave.service';
const reference = 'COSUB_' + 'a'.repeat(32);
describe('Platform subscriptions', () => {
  let service: BillingService;
  let prisma: any;
  let gateway: any;
  const payment = {
    reference,
    church_id: 'church-a',
    plan: 'essentials',
    cycle: 'monthly',
    amount: 10000,
    currency: 'NGN',
    status: 'pending',
    gateway: 'paystack',
    checkout_url: null,
  };
  beforeEach(() => {
    prisma = {
      platformSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          church_id: 'church-a',
          plan: 'essentials',
          cycle: 'monthly',
          paid_until: null,
        }),
        upsert: jest.fn().mockResolvedValue({ paid_until: null }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ paid_until: null }),
        update: jest.fn(),
      },
      subscriptionPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ ...data, checkout_url: null })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'church-a' }]),
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
    gateway = {
      name: 'paystack',
      isConfigured: jest.fn().mockReturnValue(true),
      initializeTransaction: jest.fn().mockImplementation((_e, _a, ref) =>
        Promise.resolve({
          reference: ref,
          authorizationUrl: 'https://checkout.paystack.com/secure',
        }),
      ),
      verifyTransaction: jest
        .fn()
        .mockResolvedValue({ reference, currency: 'NGN', amount: 10000, status: 'success' }),
      validateWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookEvent: jest.fn().mockReturnValue({ reference, event: 'charge.success' }),
    };
    service = new BillingService(
      prisma as PrismaService,
      { getOrThrow: () => 'https://churchos.example' } as unknown as ConfigService,
      gateway as PaystackService,
      { ...gateway, name: 'flutterwave' } as FlutterwaveService,
    );
  });
  it('calculates exact server-owned monthly/yearly prices', async () => {
    for (const [plan, prices] of Object.entries(SUBSCRIPTION_PLANS))
      for (const cycle of ['monthly', 'annual'] as const) {
        await service.checkout('church-a', 'admin@example.org', {
          plan: plan as CheckoutDto['plan'],
          cycle,
          gateway: 'paystack',
        });
        expect(gateway.initializeTransaction).toHaveBeenLastCalledWith(
          'admin@example.org',
          prices[cycle],
          expect.stringMatching(/^COSUB_[a-f0-9]{32}$/),
          { purpose: 'churchos_subscription', churchId: 'church-a' },
          { callbackUrl: 'https://churchos.example/subscription' },
        );
      }
  });
  it('rejects arbitrary plans, periods, gateways and browser price fields', async () => {
    for (const change of [
      { plan: 'free' },
      { plan: 'enterprise' },
      { cycle: 'forever' },
      { gateway: 'custom' },
      { amount: 1 },
    ]) {
      const dto = Object.assign(
        new CheckoutDto(),
        { plan: 'essentials', cycle: 'monthly', gateway: 'paystack' },
        change,
      );
      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(
        0,
      );
    }
  });
  it('does not charge an already-active workspace', async () => {
    prisma.platformSubscription.upsert.mockResolvedValueOnce({
      paid_until: new Date(Date.now() + 60000),
    });
    await expect(
      service.checkout('church-a', 'admin@example.org', {
        plan: 'essentials',
        cycle: 'monthly',
        gateway: 'paystack',
      }),
    ).rejects.toThrow('already active');
    expect(gateway.initializeTransaction).not.toHaveBeenCalled();
  });
  it('resumes the same unpaid checkout without another initialization', async () => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      ...payment,
      checkout_url: 'https://checkout.paystack.com/old',
    });
    expect(
      await service.checkout('church-a', 'admin@example.org', {
        plan: 'essentials',
        cycle: 'annual',
        gateway: 'paystack',
      }),
    ).toEqual({ reference, authorizationUrl: 'https://checkout.paystack.com/old' });
    expect(gateway.initializeTransaction).not.toHaveBeenCalled();
  });
  it.each([
    'https://evil.example/checkout',
    'javascript:alert(1)',
    'https://checkout.paystack.com.evil.example/pay',
    'https://user@checkout.paystack.com/pay',
  ])('rejects untrusted redirect %s', async (authorizationUrl) => {
    gateway.initializeTransaction.mockImplementation((_e: any, _a: any, ref: string) =>
      Promise.resolve({ reference: ref, authorizationUrl }),
    );
    await expect(
      service.checkout('church-a', 'admin@example.org', {
        plan: 'essentials',
        cycle: 'monthly',
        gateway: 'paystack',
      }),
    ).rejects.toThrow();
    expect(prisma.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });
  it('rejects cross-church references before contacting any provider', async () => {
    await expect(service.verify('church-b', reference)).rejects.toThrow('not found');
    expect(prisma.subscriptionPayment.findFirst).toHaveBeenCalledWith({
      where: { reference, church_id: 'church-b' },
    });
    expect(gateway.verifyTransaction).not.toHaveBeenCalled();
  });
  it.each([
    { currency: 'USD' },
    { amount: 1 },
    { reference: 'wrong' },
    { amount: NaN },
    { amount: 10000.01 },
  ])('does not activate a mismatched payment %j', async (mismatch) => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue(payment);
    gateway.verifyTransaction.mockResolvedValue({
      reference,
      currency: 'NGN',
      amount: 10000,
      status: 'success',
      ...mismatch,
    });
    await expect(service.verify('church-a', reference)).rejects.toThrow('do not match');
    expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
  });
  it('never activates from an unconfirmed callback or pending provider status', async () => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue(payment);
    gateway.verifyTransaction.mockResolvedValue({
      reference,
      currency: 'NGN',
      amount: 10000,
      status: 'pending',
    });
    await service.verify('church-a', reference);
    expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
  });
  it('claims a successful reference atomically and activates exactly once', async () => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue(payment);
    prisma.subscriptionPayment.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await service.verify('church-a', reference);
    await service.verify('church-a', reference);
    expect(prisma.platformSubscription.update).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('ignores an already activated reference without extending or recharging', async () => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue({ ...payment, status: 'success' });
    await service.verify('church-a', reference);
    expect(gateway.verifyTransaction).not.toHaveBeenCalled();
    expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
  });
  it('rejects unsigned callbacks before accessing the ledger', async () => {
    gateway.validateWebhookSignature.mockReturnValue(false);
    await expect(service.webhook('paystack', '{}', 'bad')).rejects.toThrow(
      'Invalid payment signature',
    );
    expect(prisma.subscriptionPayment.findUnique).not.toHaveBeenCalled();
  });
  it('does not reconcile a reference through a different gateway', async () => {
    prisma.subscriptionPayment.findUnique.mockResolvedValue({ ...payment, gateway: 'flutterwave' });
    await service.webhook('paystack', '{}', 'signed');
    expect(gateway.verifyTransaction).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-01-31T14:12:00Z', 'monthly', '2026-02-28T14:12:00.000Z'],
    ['2028-02-29T12:00:00Z', 'annual', '2029-02-28T12:00:00.000Z'],
  ])('uses calendar period %s %s', (start, cycle, end) => {
    expect(subscriptionEnd(new Date(start), cycle as 'monthly' | 'annual').toISOString()).toBe(end);
  });
});
