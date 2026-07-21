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
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
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
  queues: Record<string, 'up' | 'down'>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue('whatsapp-outbound') private readonly whatsappQueue: Queue,
    @InjectQueue('email-outbound') private readonly emailQueue: Queue,
    @InjectQueue('sms-outbound') private readonly smsQueue: Queue,
    @InjectQueue('recurring-giving') private readonly recurringGivingQueue: Queue,
    @InjectQueue('nightly-jobs') private readonly nightlyJobsQueue: Queue,
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
      await this.redis.ping();
      services.redis = 'up';
    } catch {
      services.redis = 'down';
    }

    const queues: Record<string, 'up' | 'down'> = {};
    const queueEntries: [string, Queue][] = [
      ['whatsapp-outbound', this.whatsappQueue],
      ['email-outbound', this.emailQueue],
      ['sms-outbound', this.smsQueue],
      ['recurring-giving', this.recurringGivingQueue],
      ['nightly-jobs', this.nightlyJobsQueue],
    ];

    for (const [name, queue] of queueEntries) {
      try {
        await queue.getJobCounts();
        queues[name] = 'up';
      } catch {
        queues[name] = 'down';
      }
    }

    const allServicesUp = services.database === 'up' && services.redis === 'up';
    const allQueuesUp = Object.values(queues).every((v) => v === 'up');
    const noneUp = services.database === 'down' && services.redis === 'down';

    return {
      status: noneUp ? 'unhealthy' : allServicesUp && allQueuesUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
      queues,
    };
  }
}
