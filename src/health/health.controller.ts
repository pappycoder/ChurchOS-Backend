/**
 * @file health.controller.ts
 * @description Health check endpoint for monitoring and load balancers.
 *
 * Provides GET /health endpoint that verifies:
 * - Application is running
 * - Database (PostgreSQL) is reachable
 * - Redis is reachable
 * - All BullMQ queues are operational with job count metrics
 *
 * Queue health includes per-queue breakdowns of active, waiting,
 * completed, and failed job counts for operational visibility.
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
import { SkipRateLimit } from '../common/guards/rate-limit.guard';

/**
 * Per-queue health metrics including job count breakdown.
 */
interface QueueMetrics {
  status: 'up' | 'down';
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

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
  queues: Record<string, QueueMetrics>;
}

@ApiTags('Health')
@SkipRateLimit()
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
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
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

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database = 'up';
    } catch {
      services.database = 'down';
    }

    try {
      await this.redis.ping();
      services.redis = 'up';
    } catch {
      services.redis = 'down';
    }

    const queues: Record<string, QueueMetrics> = {};
    const queueEntries: [string, Queue][] = [
      ['whatsapp-outbound', this.whatsappQueue],
      ['email-outbound', this.emailQueue],
      ['sms-outbound', this.smsQueue],
      ['recurring-giving', this.recurringGivingQueue],
      ['nightly-jobs', this.nightlyJobsQueue],
      ['broadcast', this.broadcastQueue],
    ];

    for (const [name, queue] of queueEntries) {
      try {
        const counts = await queue.getJobCounts(
          'active',
          'waiting',
          'completed',
          'failed',
          'delayed',
        );
        queues[name] = {
          status: 'up',
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      } catch {
        queues[name] = {
          status: 'down',
          active: 0,
          waiting: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        };
      }
    }

    const allServicesUp = services.database === 'up' && services.redis === 'up';
    const allQueuesUp = Object.values(queues).every((q) => q.status === 'up');
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
