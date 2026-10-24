import { measureStage } from '../../prisma/query-metrics';
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
  // Hints only: every cache read still atomically checks the current Redis version.
  private readonly versionHints = new Map<string, string>();

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
    let entry: { key: string; cached: unknown } | null;
    try {
      entry = await measureStage('response_cache', () => this.readCache(request));
    } catch {
      this.logger.warn('Response cache unavailable; using fresh data');
      return next.handle();
    }
    if (!entry) return next.handle();
    const { key: cacheKey, cached } = entry;
    if (cached !== null && cached !== undefined) {
      if (typeof cached === 'string') {
        try {
          return of(JSON.parse(cached));
        } catch {
          return of(cached);
        }
      }
      return of(cached);
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
   * Reads a viewer-specific response and its live revision in one MGET.
   * The cache key uses request method, URL, query params,
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
  private async readCache(request: Request): Promise<{ key: string; cached: unknown } | null> {
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

    const prefix = `cache:v3:${request.method}:${churchId}:${viewer}:${scope}:`;
    const suffix = `:${path}:${queryString}`;
    const hint = this.versionHints.get(churchId) ?? '0';
    const [currentVersion, cached] = await this.redis.mget(
      `cache:ver:${churchId}`,
      `${prefix}${hint}${suffix}`,
    );
    const version = String(currentVersion ?? 0);
    this.versionHints.delete(churchId);
    this.versionHints.set(churchId, version);
    if (this.versionHints.size > 500)
      this.versionHints.delete(this.versionHints.keys().next().value!);
    // A changed/missing version never allows a response from the old revision.
    // Recompute once and write under the fresh version; the next read hits.
    return { key: `${prefix}${version}${suffix}`, cached: version === hint ? cached : null };
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
