/**
 * @file queues.module.ts
 * @description BullMQ background job queue infrastructure.
 *
 * Configures BullModule with the shared Redis connection and registers
 * all named queues used across the application:
 * - whatsapp-outbound: Outbound WhatsApp messages (360dialog API)
 * - email-outbound: Outbound emails (Resend)
 * - sms-outbound: Outbound SMS (Termii)
 * - recurring-giving: Automated recurring giving charges
 * - nightly-jobs: Scheduled maintenance tasks (engagement recalc, etc.)
 *
 * Each queue has a dedicated processor that handles its respective jobs.
 * All queues share a default retry policy: 3 attempts with exponential
 * backoff (5s base). Completed jobs are retained for 24h; failed jobs
 * for 7 days for debugging.
 *
 * @module queues/queues.module
 * @since 1.0.0
 */

import { Module, forwardRef, OnModuleDestroy, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CommunicationModule } from '../communication/communication.module';
import { PastoralModule } from '../pastoral/pastoral.module';
import { GivingModule } from '../giving/giving.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { WhatsAppOutboundProcessor } from './processors/whatsapp-outbound.processor';
import { EmailOutboundProcessor } from './processors/email-outbound.processor';
import { SmsOutboundProcessor } from './processors/sms-outbound.processor';
import { RecurringGivingProcessor } from './processors/recurring-giving.processor';
import { NightlyJobsProcessor } from './processors/nightly-jobs.processor';
import { BroadcastProcessor } from './processors/broadcast.processor';
import { NightlyScheduler } from './nightly.scheduler';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
};

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          maxRetriesPerRequest: 3,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'whatsapp-outbound', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'email-outbound', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'sms-outbound', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'recurring-giving', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'nightly-jobs', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'broadcast', defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
    WhatsAppModule,
    CommunicationModule,
    PastoralModule,
    GivingModule,
    forwardRef(() => BroadcastModule),
  ],
  providers: [
    WhatsAppOutboundProcessor,
    EmailOutboundProcessor,
    SmsOutboundProcessor,
    RecurringGivingProcessor,
    NightlyJobsProcessor,
    BroadcastProcessor,
    NightlyScheduler,
  ],
  exports: [BullModule],
})
export class QueuesModule implements OnModuleDestroy {
  private readonly logger = new Logger(QueuesModule.name);

  constructor(
    @InjectQueue('whatsapp-outbound') private readonly whatsappQueue: Queue,
    @InjectQueue('email-outbound') private readonly emailQueue: Queue,
    @InjectQueue('sms-outbound') private readonly smsQueue: Queue,
    @InjectQueue('recurring-giving') private readonly recurringQueue: Queue,
    @InjectQueue('nightly-jobs') private readonly nightlyQueue: Queue,
    @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing all BullMQ queue connections...');
    await Promise.all([
      this.whatsappQueue.close(),
      this.emailQueue.close(),
      this.smsQueue.close(),
      this.recurringQueue.close(),
      this.nightlyQueue.close(),
      this.broadcastQueue.close(),
    ]);
    this.logger.log('All BullMQ queue connections closed');
  }
}
