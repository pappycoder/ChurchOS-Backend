/**
 * @file health.controller.ts
 * @description Health check endpoint for monitoring and load balancers.
 *
 * Provides GET /health endpoint that verifies:
 * - Application is running
 * - Database (PostgreSQL) is reachable
 * - Redis is reachable
 *
 * @module health/health.controller
 * @since 1.0.0
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Health check response structure.
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check(): Promise<HealthStatus> {
    const services = {
      database: 'down' as 'up' | 'down',
      redis: 'down' as 'up' | 'down',
    };

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'up';
    } catch {
      services.database = 'down';
    }

    // Check Redis
    try {
      await this.redis.client.ping();
      services.redis = 'up';
    } catch {
      services.redis = 'down';
    }

    const allUp = services.database === 'up' && services.redis === 'up';
    const noneUp = services.database === 'down' && services.redis === 'down';

    return {
      status: noneUp ? 'unhealthy' : allUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };
  }
}
