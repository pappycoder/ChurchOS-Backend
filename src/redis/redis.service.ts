import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

type RedisClient = IORedis | UpstashRedis;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly _client: RedisClient;
  private readonly _driver: 'ioredis' | 'upstash';

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL must be set');
    }

    if (url.startsWith('https://')) {
      this._driver = 'upstash';
      const token = this.config.get<string>('UPSTASH_REDIS_TOKEN');
      this._client = new UpstashRedis({ url, token });
      this.logger.log('Upstash Redis client initialized');
    } else {
      this._driver = 'ioredis';
      this._client = new IORedis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 200, 2000);
          return delay;
        },
      });
      this._client.on('connect', () => this.logger.log('ioredis connected'));
      this._client.on('error', (err) => this.logger.error('ioredis error', err));
    }
  }

  get client(): RedisClient {
    return this._client;
  }

  get isUpstash(): boolean {
    return this._driver === 'upstash';
  }

  async onModuleDestroy(): Promise<void> {
    if (this._driver === 'ioredis') {
      await (this._client as IORedis).quit();
    }
    this.logger.log('Redis client disconnected');
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this._driver === 'upstash') {
      return (this._client as UpstashRedis).get<T>(key);
    }
    const raw = await (this._client as IORedis).get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (this._driver === 'upstash') {
      if (ttlSeconds) {
        await (this._client as UpstashRedis).set(key, serialized, { ex: ttlSeconds });
      } else {
        await (this._client as UpstashRedis).set(key, serialized);
      }
    } else {
      if (ttlSeconds) {
        await (this._client as IORedis).set(key, serialized, 'EX', ttlSeconds);
      } else {
        await (this._client as IORedis).set(key, serialized);
      }
    }
  }

  async del(key: string): Promise<void> {
    if (this._driver === 'upstash') {
      await (this._client as UpstashRedis).del(key);
    } else {
      await (this._client as IORedis).del(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this._driver === 'upstash') {
      const result = await (this._client as UpstashRedis).exists(key);
      return result === 1;
    }
    const result = await (this._client as IORedis).exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this._driver === 'upstash') {
      await (this._client as UpstashRedis).expire(key, ttlSeconds);
    } else {
      await (this._client as IORedis).expire(key, ttlSeconds);
    }
  }

  async ping(): Promise<string> {
    if (this._driver === 'upstash') {
      await (this._client as UpstashRedis).ping();
      return 'pong';
    }
    return (this._client as IORedis).ping();
  }
}
