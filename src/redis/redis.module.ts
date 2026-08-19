/**
 * @file redis.module.ts
 * @description Global module providing the Upstash Redis client.
 *
 * @module redis/redis.module
 * @since 1.0.0
 */

import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
