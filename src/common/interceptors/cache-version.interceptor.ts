/**
 * @file cache-version.interceptor.ts
 * @description Global interceptor that invalidates tenant-scoped caches on mutation.
 *
 * A church-scoped cache version counter is bumped after any successful write
 * request (non-GET). The CacheInterceptor embeds this version in its cache
 * keys, so any mutation automatically invalidates all cached responses for
 * that church — no per-endpoint @CacheInvalidate() bookkeeping required.
 *
 * Reads are unaffected; the version only changes when data changes.
 *
 * @module common/interceptors/cache-version.interceptor
 * @since 1.0.0
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';

/** Prefix for per-church cache version counters */
export const CACHE_VERSION_PREFIX = 'cache:ver:';

/** TTL for version counters so stale counters never accumulate in Redis */
const VERSION_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class CacheVersionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheVersionInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // Only mutations invalidate caches.
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return next.handle();
    }

    const churchId = (request as AuthenticatedRequest).profile?.church_id;
    if (!churchId) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget: bumping the version must never block the response.
        this.redis
          .incr(`${CACHE_VERSION_PREFIX}${churchId}`, VERSION_TTL_SECONDS)
          .catch((err) => this.logger.warn(`Cache version bump failed: ${(err as Error).message}`));
      }),
    );
  }
}
