/**
 * @file cache.interceptor.ts
 * @description NestJS interceptor that caches GET responses in Redis.
 *
 * Provides a decorator-based caching system for expensive queries
 * (dashboard, analytics, reports). Cache keys include the request
 * URL and relevant query parameters. Cache is automatically invalidated
 * when related mutations occur.
 *
 * Usage:
 * @UseInterceptors(CacheInterceptor)
 * @CacheTTL(300) // 5 minutes
 * async getDashboard() { ... }
 *
 * @module common/interceptors/cache.interceptor
 * @since 1.0.0
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';
import { createHash } from 'node:crypto';
import { Request } from 'express';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';

export const CACHE_TTL_KEY = 'cache_ttl';
export const CACHE_INVALIDATE_KEY = 'cache_invalidate';

/**
 * Sets the TTL (time-to-live) for cached responses.
 *
 * @param ttlSeconds - Cache duration in seconds (default: 300 = 5 minutes)
 */
export const CacheTTL = (ttlSeconds: number) => SetMetadata(CACHE_TTL_KEY, ttlSeconds);

/**
 * Invalidates cache entries matching the given patterns when the decorated
 * endpoint is called. Used on write endpoints to clear stale data.
 *
 * @param patterns - Cache key patterns to invalidate (e.g., ['dashboard:*', 'analytics:*'])
 */
export const CacheInvalidate = (...patterns: string[]) =>
  SetMetadata(CACHE_INVALIDATE_KEY, patterns);

/**
 * Interceptor that caches GET responses in Redis.
 *
 * - Only caches GET requests (safe, idempotent)
 * - Skips caching if Redis is unavailable
 * - Cache key = method:url:query-string
 * - TTL defaults to 5 minutes, overridable via @CacheTTL()
 *
 * Write endpoints decorated with @CacheInvalidate() will clear matching
 * cache patterns on mutation.
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const handler = context.getHandler();
    const request = context.switchToHttp().getRequest<Request>();

    // ─── Handle cache invalidation for write endpoints ──────────
    const invalidatePatterns = this.reflector.getAllAndOverride<string[]>(CACHE_INVALIDATE_KEY, [
      handler,
      context.getClass(),
    ]);

    if (invalidatePatterns && invalidatePatterns.length > 0) {
      // Fire-and-forget invalidation before proceeding
      this.invalidateCachePatterns(invalidatePatterns).catch((err) =>
        this.logger.warn(`Cache invalidation error: ${(err as Error).message}`),
      );
      return next.handle();
    }

    // ─── Only cache GET requests ────────────────────────────────
    if (request.method !== 'GET') {
      return next.handle();
    }

    // ─── Check for cache TTL ────────────────────────────────────
    const ttlSeconds = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      handler,
      context.getClass(),
    ]);

    // No caching if no TTL defined
    if (!ttlSeconds) {
      return next.handle();
    }

    // ─── Try to serve from cache ─────────────────────────────────
    const cacheKey = await this.buildCacheKey(request);
    if (!cacheKey) return next.handle();

    try {
      const cached = await this.redis.get<string>(cacheKey);
      if (cached) {
        try {
          return of(JSON.parse(cached));
        } catch {
          return of(cached);
        }
      }
    } catch (err) {
      this.logger.warn(`Cache read error: ${(err as Error).message}`);
      // Proceed without cache on Redis error
    }

    // ─── Cache the response for next time ────────────────────────
    return next.handle().pipe(
      tap((data) => {
        if (data !== null && data !== undefined) {
          this.redis
            .set(cacheKey, JSON.stringify(data), ttlSeconds)
            .catch((err) => this.logger.warn(`Cache write error: ${(err as Error).message}`));
        }
      }),
    );
  }

  /**
   * Builds a unique cache key from the request method, URL, query params,
   * the authenticated tenant, the viewer's effective branch scope, and the
   * tenant's current cache version.
   *
   * Including church_id prevents cached responses from leaking across
   * churches (multi-tenant isolation). Including the branch scope prevents
   * leakage WITHIN a church: an admin-HQ viewer (church-wide) and a
   * branch-restricted viewer hitting the same URL would otherwise share one
   * entry and could be served each other's scope. Including the cache version
   * means any write to the church (via CacheVersionInterceptor) changes the
   * key and forces a recompute — stale data can never be served.
   */
  private async buildCacheKey(request: Request): Promise<string | null> {
    const url = new URL(request.originalUrl || request.url, 'http://internal');
    url.searchParams.sort();
    const queryString = url.searchParams.toString();
    const path = url.pathname;
    const profile = (request as AuthenticatedRequest).profile;
    if (!profile?.church_id) return null;
    const churchId = profile.church_id;
    const viewer = createHash('sha256')
      .update(
        JSON.stringify([profile.id, profile.member_id, [...(profile.permissions ?? [])].sort()]),
      )
      .digest('hex')
      .slice(0, 24);
    // Effective branch scope: admin-HQ holders see the whole church ('hq');
    // everyone else is pinned to their own branch (or 'none' when unassigned).
    const scope = profile?.is_admin_hq ? 'hq' : profile?.branch_id || 'none';

    let version = '0';
    try {
      version = String((await this.redis.get<number>(`cache:ver:${churchId}`)) ?? 0);
    } catch {
      // Never reuse a potentially stale version during a Redis outage.
      return null;
    }

    return `cache:v3:${request.method}:${churchId}:${viewer}:${scope}:${version}:${path}:${queryString}`;
  }

  /**
   * Invalidates cache entries matching the given glob patterns.
   * Scans Redis keys matching each pattern and deletes them.
   */
  private async invalidateCachePatterns(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      const cachePattern = pattern.startsWith('cache:') ? pattern : `cache:${pattern}`;
      try {
        await this.redis.deleteMatching(cachePattern);
      } catch {
        // Wildcard deletion may not be supported locally — log and continue
        this.logger.debug(`Cache invalidation for ${cachePattern} (may need manual clear)`);
      }
    }
  }
}
