import { SubscriptionPricingService } from '../../../src/billing/subscription-pricing.service';
import { RedisService } from '../../../src/redis/redis.service';
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
  let pricing: SubscriptionPricingService;
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
      member: { count: jest.fn().mockResolvedValue(25) },
      profile: { count: jest.fn().mockResolvedValue(1) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      staffInvitationReservation: { count: jest.fn().mockResolvedValue(0) },
      platformSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          church_id: 'church-a',
          plan: 'essentials',
          cycle: 'monthly',
          paid_until: null,
        }),
        upsert: jest
          .fn()
          .mockResolvedValue({ plan: 'essentials', cycle: 'monthly', paid_until: null }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ plan: 'essentials', cycle: 'monthly', paid_until: null }),
        update: jest.fn(),
      },
      subscriptionPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
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
    const cache = new Map<string, unknown>();
    pricing = new SubscriptionPricingService(
      {
        get: jest.fn(async (key: string) => cache.get(key) ?? null),
        set: jest.fn(async (key: string, value: unknown) => {
          cache.set(key, value);
        }),
      } as unknown as RedisService,
      new ConfigService({
        SUBSCRIPTION_PAYSTACK_CURRENCIES: 'NGN,USD',
        SUBSCRIPTION_FLUTTERWAVE_CURRENCIES: 'NGN,USD',
      }),
    );
    service = new BillingService(
      prisma as PrismaService,
      { getOrThrow: () => 'https://churchos.example' } as unknown as ConfigService,
      gateway as PaystackService,
      { ...gateway, name: 'flutterwave' } as FlutterwaveService,
      pricing,
    );
  });
  async function checkout(churchId: string, email: string, dto: CheckoutDto) {
    const quote = await service.quote(churchId, dto);
    return service.checkout(churchId, email, { ...dto, quoteId: quote.quoteId });
  }
  it('calculates exact server-owned monthly/yearly prices', async () => {
    for (const [plan, prices] of Object.entries(SUBSCRIPTION_PLANS))
      for (const cycle of ['monthly', 'annual'] as const) {
        await checkout('church-a', 'admin@example.org', {
          plan: plan as CheckoutDto['plan'],
          cycle,
          gateway: 'paystack',
        });
        expect(gateway.initializeTransaction).toHaveBeenLastCalledWith(
          'admin@example.org',
          prices[cycle],
          expect.stringMatching(/^COSUB_[a-f0-9]{32}$/),
          { purpose: 'churchos_subscription', churchId: 'church-a' },
          { callbackUrl: 'https://churchos.example/subscription', currency: 'USD' },
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
      { currency: 'BTC' },
      { quoteId: 'fake' },
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
      plan: 'essentials',
      cycle: 'monthly',
      paid_until: new Date(Date.now() + 60000),
    });
    await expect(
      checkout('church-a', 'admin@example.org', {
        plan: 'essentials',
        cycle: 'monthly',
        gateway: 'paystack',
      }),
    ).rejects.toThrow('subscription changed');
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
        cycle: 'monthly',
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
      checkout('church-a', 'admin@example.org', {
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
  it('quotes an immediate upgrade for only the remaining paid period', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T00:00:00Z'));
    try {
      prisma.platformSubscription.findUniqueOrThrow.mockResolvedValue({
        plan: 'essentials',
        cycle: 'monthly',
        period_started_at: new Date('2026-10-01T00:00:00Z'),
        paid_until: new Date('2026-10-31T00:00:00Z'),
      });
      const quote = await service.quote('church-a', {
        plan: 'community',
        cycle: 'monthly',
        gateway: 'paystack',
      });
      expect(quote).toMatchObject({
        intent: 'upgrade',
        amount: 5,
        renewBy: '2026-10-31T00:00:00.000Z',
      });
      expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('records a stale successful payment for review without changing the current paid plan', async () => {
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      ...payment,
      intent: 'upgrade',
      base_plan: 'essentials',
      base_paid_until: new Date('2026-10-31T00:00:00Z'),
      target_paid_until: new Date('2026-10-31T00:00:00Z'),
    });
    prisma.platformSubscription.findUniqueOrThrow.mockResolvedValue({
      plan: 'network',
      paid_until: new Date('2027-01-01T00:00:00Z'),
    });
    await service.verify('church-a', reference);
    expect(prisma.subscriptionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success', application_status: 'review' }),
      }),
    );
    expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
  });
  it('does not silently substitute a different pending quote from another tab', async () => {
    const dto: CheckoutDto = { plan: 'essentials', cycle: 'monthly', gateway: 'paystack' };
    const quoted = await service.quote('church-a', dto);
    prisma.subscriptionPayment.findFirst.mockResolvedValue({
      ...payment,
      currency: 'USD',
      pricing_snapshot: { quoteId: 'COSQ_' + 'c'.repeat(32) },
      checkout_url: 'https://checkout.paystack.com/other-tab',
    });
    await expect(
      service.checkout('church-a', 'admin@example.org', { ...dto, quoteId: quoted.quoteId }),
    ).rejects.toThrow('Another checkout');
    expect(gateway.initializeTransaction).not.toHaveBeenCalled();
  });
  it('freezes a rounded NGN quote and passes its currency to the provider', async () => {
    jest
      .spyOn(pricing, 'exchange')
      .mockResolvedValue({ rate: 1500.111, updatedAt: new Date().toISOString() });
    const dto: CheckoutDto = {
      plan: 'essentials',
      cycle: 'monthly',
      gateway: 'paystack',
      currency: 'NGN',
    };
    const quoted = await service.quote('church-a', dto);
    expect(quoted.amount).toBe(15002);
    jest
      .spyOn(pricing, 'exchange')
      .mockResolvedValue({ rate: 2000, updatedAt: new Date().toISOString() });
    await service.checkout('church-a', 'admin@example.org', { ...dto, quoteId: quoted.quoteId });
    expect(gateway.initializeTransaction).toHaveBeenCalledWith(
      expect.any(String),
      15002,
      expect.any(String),
      expect.any(Object),
      { callbackUrl: 'https://churchos.example/subscription', currency: 'NGN' },
    );
    expect(prisma.subscriptionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 15002,
          currency: 'NGN',
          pricing_snapshot: expect.objectContaining({ exchangeRate: 1500.111, usdAmount: 10 }),
        }),
      }),
    );
  });
  it('requires a quote and rejects expired, cross-church and changed-currency quotes', async () => {
    const dto: CheckoutDto = { plan: 'essentials', cycle: 'monthly', gateway: 'paystack' };
    await expect(service.checkout('church-a', 'admin@example.org', dto)).rejects.toThrow(
      'fresh payment quote',
    );
    const quoted = await service.quote('church-a', dto);
    await expect(
      service.checkout('church-b', 'admin@example.org', { ...dto, quoteId: quoted.quoteId }),
    ).rejects.toThrow('expired');
    await expect(
      service.checkout('church-a', 'admin@example.org', {
        ...dto,
        currency: 'NGN',
        quoteId: quoted.quoteId,
      }),
    ).rejects.toThrow('different');
    jest.useFakeTimers().setSystemTime(Date.now() + 901000);
    try {
      await expect(
        service.checkout('church-a', 'admin@example.org', { ...dto, quoteId: quoted.quoteId }),
      ).rejects.toThrow('expired');
    } finally {
      jest.useRealTimers();
    }
    expect(gateway.initializeTransaction).not.toHaveBeenCalled();
  });
  it('returns church-wide usage including reserved staff seats', async () => {
    prisma.staffInvitationReservation.count.mockResolvedValue(1);
    const status = await service.status('church-a');
    expect(status.limits).toEqual({ members: 100, staff: 2, locations: 1 });
    expect(status.usage).toEqual({ members: 25, staff: 2, locations: 1, pendingInvitations: 1 });
  });
  it('blocks plan scheduling while an unpaid checkout is outstanding', async () => {
    prisma.platformSubscription.findUniqueOrThrow.mockResolvedValue({
      plan: 'network',
      cycle: 'monthly',
      paid_until: new Date(Date.now() + 86400000),
    });
    prisma.subscriptionPayment.findFirst.mockResolvedValue(payment);
    await expect(service.schedule('church-a', 'community', 'monthly')).rejects.toThrow(
      'pending checkout',
    );
    expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-01-31T14:12:00Z', 'monthly', '2026-02-28T14:12:00.000Z'],
    ['2028-02-29T12:00:00Z', 'annual', '2029-02-28T12:00:00.000Z'],
  ])('uses calendar period %s %s', (start, cycle, end) => {
    expect(subscriptionEnd(new Date(start), cycle as 'monthly' | 'annual').toISOString()).toBe(end);
  });
});
