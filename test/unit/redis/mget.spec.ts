import { RedisService } from '../../../src/redis/redis.service';

describe('Atomic Redis reads across drivers', () => {
  it('decodes TCP values like get() while preserving missing keys and raw versions', async () => {
    const client = {
      mget: jest.fn().mockResolvedValue(['revision-uuid', '{"total":3}', null, '7']),
    };
    const redis = Object.assign(Object.create(RedisService.prototype), {
      _driver: 'ioredis',
      _client: client,
    }) as RedisService;
    expect(await redis.mget('version', 'payload', 'missing', 'old-number')).toEqual([
      'revision-uuid',
      { total: 3 },
      null,
      7,
    ]);
  });
  it('preserves REST values already decoded by the Upstash SDK', async () => {
    const client = { mget: jest.fn().mockResolvedValue(['revision', { total: 3 }, null]) };
    const redis = Object.assign(Object.create(RedisService.prototype), {
      _driver: 'upstash',
      _client: client,
    }) as RedisService;
    expect(await redis.mget('version', 'payload', 'missing')).toEqual([
      'revision',
      { total: 3 },
      null,
    ]);
  });
});
