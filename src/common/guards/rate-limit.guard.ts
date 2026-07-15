/**
 * @file rate-limit.guard.ts
 * @description Guard that enforces rate limiting using Upstash Redis.
 *
 * Uses sliding window rate limiting to prevent API abuse.
 * Different limits can be applied per-route using @RateLimit() decorator.
 *
 * @module common/guards/rate-limit.guard
 * @since 1.0.0
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Ratelimit } from '@upstash/ratelimit';
import { RedisService } from '../../redis/redis.service';
import { Redis } from '@upstash/redis';
import { Request } from 'express';

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

/**
 * Default rate limits for different endpoint types.
 */
export const RATE_LIMITS = {
  /** General API endpoints: 100 requests per minute */
  default: { limit: 100, windowSeconds: 60 },
  /** Auth endpoints: 10 requests per minute (login, register) */
  auth: { limit: 10, windowSeconds: 60 },
  /** Sensitive operations: 5 requests per minute */
  sensitive: { limit: 5, windowSeconds: 60 },
} as const;

/**
 * Rate limit decorator.
 *
 * @example
 * ```typescript
 * @Post('login')
 * @RateLimit(RATE_LIMITS.auth)
 * login() { ... }
 * ```
 */
export const RateLimit =
  (config: RateLimitConfig) =>
  (_target: object, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, config, descriptor.value);
    }
    return descriptor;
  };

/**
 * Guard that enforces rate limiting per IP address.
 *
 * Uses Upstash Redis sliding window algorithm for accurate rate limiting.
 * Falls through (allows request) if Redis is unavailable.
 *
 * @example
 * ```typescript
 * @UseGuards(RateLimitGuard)
 * @Get('members')
 * findAll() { ... }
 * ```
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly ratelimit: Ratelimit | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {
    try {
      this.ratelimit = new Ratelimit({
        redis: this.redis.client as unknown as Redis,
        limiter: Ratelimit.slidingWindow(100, '60 s'),
        analytics: true,
      });
    } catch {
      this.logger.warn('Rate limiting disabled: Redis not available');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.ratelimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';

    // Check for custom rate limit on the handler
    const handler = context.getHandler();
    const customConfig = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      handler,
    ]);

    const config = customConfig || RATE_LIMITS.default;

    try {
      // Create a unique key for this IP + endpoint
      const key = `${ip}:${request.route?.path || request.url}`;

      // Create a new ratelimit instance with custom config if needed
      const limiter = new Ratelimit({
        redis: this.redis.client as unknown as Redis,
        limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
      });

      const { success, limit, remaining, reset } = await limiter.limit(key);

      // Set rate limit headers
      request.res?.setHeader('X-RateLimit-Limit', limit);
      request.res?.setHeader('X-RateLimit-Remaining', remaining);
      request.res?.setHeader('X-RateLimit-Reset', reset);

      if (!success) {
        throw new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If rate limiting fails, allow the request
      this.logger.warn(`Rate limiting error: ${error}`);
      return true;
    }
  }
}
