/**
 * @file health.module.ts
 * @description Module providing health check endpoint.
 *
 * @module health/health.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
