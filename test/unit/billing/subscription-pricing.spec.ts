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
  it('only enables explicitly configured merchant currencies', () => {
    expect(service.gatewayCurrencies('paystack')).toEqual(['NGN']);
    expect(() => service.assertGatewayCurrency('paystack', 'USD')).toThrow('not enabled');
    expect(() => service.currency('BTC')).toThrow('supported');
  });
});
