/**
 * @file sms-outbound.processor.ts
 * @description BullMQ processor for outbound SMS messages.
 *
 * Handles jobs from the 'sms-outbound' queue. Each job contains
 * a recipient phone number, message content, and church ID.
 * Integrates with the Termii API for SMS delivery.
 *
 * @module queues/processors/sms-outbound.processor
 * @since 1.0.0
 */

import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('sms-outbound')
export class SmsOutboundProcessor {
  private readonly logger = new Logger(SmsOutboundProcessor.name);

  /**
   * Processes a single outbound SMS message job.
   *
   * @param job - BullMQ job containing recipient phone, message content, and church ID
   * @returns Void — SMS sent via Termii API
   */
  @Process('send')
  async handleSend(job: Job<{ to: string; message: string; churchId: string }>): Promise<void> {
    this.logger.log(`Processing SMS to ${job.data.to}`);
    // TODO: integrate with Termii API
  }
}
