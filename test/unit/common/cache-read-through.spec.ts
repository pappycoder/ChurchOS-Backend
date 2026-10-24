import { firstValueFrom, of } from 'rxjs';
import {
  CacheInterceptor,
  CACHE_TTL_KEY,
} from '../../../src/common/interceptors/cache.interceptor';

function harness() {
  const values = new Map<string, unknown>();
  const redis = {
    mget: jest.fn(async (...keys: string[]) => keys.map((key) => values.get(key) ?? null)),
    set: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
  const cache = new CacheInterceptor(
    redis as never,
    { getAllAndOverride: (key: string) => (key === CACHE_TTL_KEY ? 60 : undefined) } as never,
  );
  const read = async (
    profile = { id: 'viewer', church_id: 'church', is_admin_hq: true },
    generate = jest.fn(() => of({ value: 'fresh' })),
  ) => {
    const req = { method: 'GET', url: '/reports/financial', profile };
    const response = await cache.intercept(
      {
        getHandler: () => null,
        getClass: () => null,
        switchToHttp: () => ({ getRequest: () => req }),
      } as never,
      { handle: generate },
    );
    return { body: await firstValueFrom(response), generate };
  };
  return { values, redis, read };
}
describe('Atomic versioned cache read-through', () => {
  it('reads a warm entry and its fresh version in one operation', async () => {
    const { redis, read } = harness();
    await read();
    const generate = jest.fn(() => of({ value: 'unexpected' }));
    expect((await read(undefined, generate)).body).toEqual({ value: 'fresh' });
    expect(generate).not.toHaveBeenCalled();
    expect(redis.mget).toHaveBeenCalledTimes(2);
    expect(redis.mget.mock.calls.every((keys) => keys.length === 2)).toBe(true);
  });
  it('never serves the old entry after invalidation or Redis failure', async () => {
    const { values, redis, read } = harness();
    await read();
    values.set('cache:ver:church', 'new-version');
    const generate = jest.fn(() => of({ value: 'updated' }));
    expect((await read(undefined, generate)).body).toEqual({ value: 'updated' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await read()).body).toEqual({ value: 'updated' });
    redis.mget.mockRejectedValueOnce(new Error('down'));
    expect(
      (
        await read(
          undefined,
          jest.fn(() => of({ value: 'outage-fresh' })),
        )
      ).body,
    ).toEqual({ value: 'outage-fresh' });
  });
  it('keeps response data partitioned by viewer and tenant', async () => {
    const { read } = harness();
    await read();
    for (const profile of [
      { id: 'other', church_id: 'church', is_admin_hq: true },
      { id: 'viewer', church_id: 'other', is_admin_hq: true },
    ]) {
      const generate = jest.fn(() => of({ value: 'scoped' }));
      expect((await read(profile, generate)).body).toEqual({ value: 'scoped' });
      expect(generate).toHaveBeenCalledTimes(1);
    }
  });
});
