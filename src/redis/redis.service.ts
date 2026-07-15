/**
 * @file redis.service.ts
 * @description Wraps the Upstash Redis client for caching and queues.
 *
 * Provides typed access to Redis for:
 * - Caching frequently accessed data (permissions, church config)
 * - BullMQ job queues (background jobs, webhooks)
 * - Rate limiting
 * - Session/token cache
 *
 * @module redis/redis.service
 * @since 1.0.0
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

/**
 * Service wrapping the Upstash Redis client.
 *
 * @example
 * ```typescript
 * await this.redis.set('user:123', userData, { ex: 3600 });
 * const user = await this.redis.get('user:123');
 * ```
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly _client: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');

    if (!url) {
      throw new Error('REDIS_URL must be set');
    }

    // Upstash Redis uses REST API, no password needed in URL
    this._client = new Redis({
      url,
      token: this.config.get<string>('UPSTASH_REDIS_TOKEN'),
    });

    this.logger.log('Redis client initialized');
  }

  /**
   * The raw Upstash Redis client instance.
   */
  get client(): Redis {
    return this._client;
  }

  /**
   * Close the Redis connection.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Redis client disconnected');
  }

  // ─── Convenience Methods ─────────────────────────────────

  /**
   * Get a value by key.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    return this._client.get<T>(key);
  }

  /**
   * Set a key with optional TTL (in seconds).
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this._client.set(key, value, { ex: ttlSeconds });
    } else {
      await this._client.set(key, value);
    }
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<void> {
    await this._client.del(key);
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this._client.exists(key);
    return result === 1;
  }

  /**
   * Set TTL on an existing key (in seconds).
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this._client.expire(key, ttlSeconds);
  }
}
