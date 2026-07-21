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
 * Each queue has a dedicated processor stub that will be wired to
 * the corresponding service implementation.
 *
 * @module queues/queues.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { WhatsAppOutboundProcessor } from './processors/whatsapp-outbound.processor';
import { EmailOutboundProcessor } from './processors/email-outbound.processor';
import { SmsOutboundProcessor } from './processors/sms-outbound.processor';
import { RecurringGivingProcessor } from './processors/recurring-giving.processor';
import { NightlyJobsProcessor } from './processors/nightly-jobs.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_URL', 'redis://localhost:5433'),
          maxRetriesPerRequest: 3,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'whatsapp-outbound' },
      { name: 'email-outbound' },
      { name: 'sms-outbound' },
      { name: 'recurring-giving' },
      { name: 'nightly-jobs' },
    ),
  ],
  providers: [
    WhatsAppOutboundProcessor,
    EmailOutboundProcessor,
    SmsOutboundProcessor,
    RecurringGivingProcessor,
    NightlyJobsProcessor,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
