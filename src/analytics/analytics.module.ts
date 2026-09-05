/**
 * @file analytics.module.ts
 * @description Analytics module for cross-domain reporting.
 *
 * Provides AnalyticsService and AnalyticsController for dashboard
 * and report endpoints.
 *
 * @module analytics/analytics.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
