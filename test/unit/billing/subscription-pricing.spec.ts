import { ConfigService } from '@nestjs/config';
import {
  SubscriptionPricingService,
  convertedPrice,
  PRICING_CURRENCIES,
} from '../../../src/billing/subscription-pricing.service';
import { RedisService } from '../../../src/redis/redis.service';

describe('USD subscription prices and FX', () => {
  const cache = new Map<string, unknown>();
  const redis = {
    get: jest.fn(async (key: string) => cache.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      cache.set(key, value);
    }),
  };
  let service: SubscriptionPricingService;
  beforeEach(() => {
    cache.clear();
    jest.clearAllMocks();
    service = new SubscriptionPricingService(redis as unknown as RedisService, new ConfigService());
  });
  afterEach(() => jest.restoreAllMocks());
  it.each([
    [10, 1500.111, 15002],
    [10, 1.1, 11],
    [108, 1500.111, 162012],
    [10, 0.89, 9],
  ])('rounds USD %s at %s to whole currency units', (usd, rate, expected) => {
    expect(convertedPrice(usd, rate)).toBe(expected);
  });
  it('works in USD without an FX provider or Redis read', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect((await service.catalog('USD')).plans.map((p) => [p.monthly, p.annual])).toEqual([
      [10, 108],
      [20, 216],
      [40, 432],
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });
  it('caches validated daily rates and returns converted prices rather than a rates feed', async () => {
    const rates = Object.fromEntries(
      PRICING_CURRENCIES.map((c) => [c, c === 'USD' ? 1 : 1500.111]),
    );
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        result: 'success',
        base_code: 'USD',
        rates,
        time_last_update_unix: Math.floor(Date.now() / 1000),
        time_next_update_unix: Math.floor(Date.now() / 1000) + 86400,
      }),
    );
    const catalog = await service.catalog('NGN');
    expect(catalog.plans[0]).toMatchObject({ monthly: 15002, annual: 162012 });
    expect(catalog).not.toHaveProperty('rates');
    await service.catalog('KES');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['offline', 'stale', 'invalid'])('fails closed on %s conversions', async (failure) => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    if (failure === 'offline') fetch.mockRejectedValue(new Error('offline'));
    else
      fetch.mockResolvedValue(
        Response.json({
          result: 'success',
          base_code: 'USD',
          rates: { USD: 1, NGN: -1 },
          time_last_update_unix: Math.floor(Date.now() / 1000) - (failure === 'stale' ? 200000 : 0),
        }),
      );
    await expect(service.catalog('NGN')).rejects.toThrow('temporarily unavailable');
    expect(redis.set).not.toHaveBeenCalled();
  });
  function providerResponse() {
    return Response.json({
      result: 'success',
      base_code: 'USD',
      rates: Object.fromEntries(PRICING_CURRENCIES.map((c) => [c, c === 'USD' ? 1 : 1.1])),
      time_last_update_unix: Math.floor(Date.now() / 1000),
      time_next_update_unix: Math.floor(Date.now() / 1000) + 86400,
    });
  }
  it('converts all supported currencies when Redis reads and writes fail', async () => {
    redis.get.mockRejectedValueOnce(new Error('Redis unavailable'));
    redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse());
    for (const currency of PRICING_CURRENCIES.filter((c) => c !== 'USD')) {
      expect((await service.catalog(currency)).plans[0]).toMatchObject({
        monthly: 11,
        annual: 119,
      });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });
  it('shares one provider request across simultaneous currency requests', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse());
    await Promise.all(['NGN', 'EUR', 'GBP'].map((currency) => service.catalog(currency)));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });
  it.each([
    { rates: { USD: 1, NGN: -1 } },
    { updatedAt: 'invalid' },
    { updatedAt: new Date(Date.now() + 86400000).toISOString() },
    { updatedAt: new Date(Date.now() - 200000000).toISOString() },
  ])('refetches malformed, future or stale shared-cache data: %j', async (invalid) => {
    cache.set('subscription:fx:usd:v1', {
      updatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 86400000,
      rates: Object.fromEntries(PRICING_CURRENCIES.map((c) => [c, c === 'USD' ? 1 : 1.1])),
      ...invalid,
    });
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse());
    expect((await service.catalog('NGN')).plans[0].monthly).toBe(11);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not serve expired in-process rates when the provider fails', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(providerResponse());
    await service.catalog('NGN');
    const later = Date.now() + 172800001;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    fetch.mockRejectedValue(new Error('provider unavailable'));
    await expect(service.catalog('NGN')).rejects.toThrow('temporarily unavailable');
  });
  it('still requires Redis for payment quote storage and lookup', async () => {
    redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(service.saveQuote('church-a', {} as never)).rejects.toThrow(
      'prepare your payment quote',
    );
    redis.get.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(service.getQuote('church-a', 'quote-id')).rejects.toThrow(
      'retrieve your payment quote',
    );
  });
  it('only enables explicitly configured merchant currencies', () => {
    expect(service.gatewayCurrencies('paystack')).toEqual(['NGN']);
    expect(() => service.assertGatewayCurrency('paystack', 'USD')).toThrow('not enabled');
    expect(() => service.currency('BTC')).toThrow('supported');
  });
});
