/**
 * @file cache.interceptor.spec.ts
 * @description Unit tests for CacheInterceptor.buildCacheKey — asserts the
 * Redis cache key is partitioned by church AND by the viewer's effective
 * branch scope, so an admin-HQ viewer (church-wide) and a branch-restricted
 * viewer hitting the same URL never share a cached entry within one church.
 */
import { CacheInterceptor } from '../../../src/common/interceptors/cache.interceptor';
import type { RedisService } from '../../../src/redis/redis.service';
import type { Reflector } from '@nestjs/core';

/** Exposes the private method for direct testing without an `any` cast. */
type KeyBuilder = { buildCacheKey(request: Request): Promise<string> };

describe('CacheInterceptor.buildCacheKey', () => {
  const churchId = 'church-1';
  const branchA = '11111111-1111-1111-1111-111111111111';
  const branchB = '22222222-2222-2222-2222-222222222222';

  function makeInterceptor(version = 7) {
    const redis = { get: jest.fn().mockResolvedValue(version) } as unknown as RedisService;
    const reflector = {} as unknown as Reflector;
    return new CacheInterceptor(redis, reflector);
  }

  function makeRequest(opts: {
    url?: string;
    path?: string;
    profile?: Record<string, unknown>;
  }): Request {
    return {
      method: 'GET',
      url: opts.url ?? '/api/v1/analytics/giving',
      route: opts.path ? { path: opts.path } : undefined,
      profile: opts.profile,
    } as unknown as Request;
  }

  const keyOf = (interceptor: CacheInterceptor, request: Request) =>
    (interceptor as unknown as KeyBuilder).buildCacheKey(request);

  it('embeds method, church, scope, version, path and query in the key', async () => {
    const interceptor = makeInterceptor(9);
    const key = await keyOf(
      interceptor,
      makeRequest({
        url: '/api/v1/analytics/giving?branchId=x',
        path: '/analytics/giving',
        profile: { church_id: churchId, is_admin_hq: true },
      }),
    );
    expect(key).toBe(`cache:GET:${churchId}:hq:9:/analytics/giving:branchId=x`);
  });

  it('uses the "hq" scope token for an admin-hq viewer regardless of their branch', async () => {
    const interceptor = makeInterceptor();
    const key = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, branch_id: branchA, is_admin_hq: true } }),
    );
    expect(key).toContain(`:${churchId}:hq:`);
  });

  it('uses the branch id as the scope token for a branch-restricted viewer', async () => {
    const interceptor = makeInterceptor();
    const key = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, branch_id: branchA, is_admin_hq: false } }),
    );
    expect(key).toContain(`:${churchId}:${branchA}:`);
  });

  it('gives an HQ viewer and a branch viewer different keys on the same URL', async () => {
    const interceptor = makeInterceptor();
    const hqKey = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, is_admin_hq: true } }),
    );
    const branchKey = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, branch_id: branchA, is_admin_hq: false } }),
    );
    expect(hqKey).not.toBe(branchKey);
  });

  it('gives two different branches different keys on the same URL', async () => {
    const interceptor = makeInterceptor();
    const a = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, branch_id: branchA, is_admin_hq: false } }),
    );
    const b = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, branch_id: branchB, is_admin_hq: false } }),
    );
    expect(a).not.toBe(b);
  });

  it('falls back to the "none" scope token for a non-HQ viewer with no branch', async () => {
    const interceptor = makeInterceptor();
    const key = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, is_admin_hq: false } }),
    );
    expect(key).toContain(`:${churchId}:none:`);
  });

  it('falls back to "global" church and "none" scope when there is no profile', async () => {
    const interceptor = makeInterceptor();
    const key = await keyOf(interceptor, makeRequest({ profile: undefined }));
    expect(key).toContain(':global:none:');
  });

  it('falls back to version 0 when the version read fails', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
    } as unknown as RedisService;
    const interceptor = new CacheInterceptor(redis, {} as unknown as Reflector);
    const key = await keyOf(
      interceptor,
      makeRequest({ profile: { church_id: churchId, is_admin_hq: true } }),
    );
    expect(key).toContain(`:${churchId}:hq:0:`);
  });
});
