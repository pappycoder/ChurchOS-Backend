import { RedisService } from '../../../src/redis/redis.service';

describe('Atomic expiring counters', () => {
  it.each(['ioredis', 'upstash'])('uses one atomic operation with TTL on %s', async (driver) => {
    const client = { eval: jest.fn().mockResolvedValue(3), incr: jest.fn(), expire: jest.fn() };
    const service = Object.assign(Object.create(RedisService.prototype), {
      _client: client,
      _driver: driver,
    }) as RedisService;
    expect(await service.incr('rate:test', 60)).toBe(3);
    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(client.incr).not.toHaveBeenCalled();
    expect(client.expire).not.toHaveBeenCalled();
    expect(client.eval.mock.calls[0][0]).toContain("redis.call('EXPIRE'");
    if (driver === 'upstash')
      expect(client.eval.mock.calls[0].slice(1)).toEqual([['rate:test'], [60]]);
    else expect(client.eval.mock.calls[0].slice(1)).toEqual([1, 'rate:test', 60]);
  });
});
