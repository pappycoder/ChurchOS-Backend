/**
 * @file whatsapp-outbound.processor.ts
 * @description BullMQ processor for outbound WhatsApp messages.
 *
 * Handles jobs from the 'whatsapp-outbound' queue. Each job contains
 * a recipient phone number, message content, and church ID for tenant scoping.
 * Delegates to WhatsAppService to send via the 360dialog Cloud API.
 *
 * Retry policy: 3 attempts with exponential backoff (5s base).
 * Failed jobs are retained for 7 days for debugging.
 *
 * @module queues/processors/whatsapp-outbound.processor
 * @since 1.0.0
 */

import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';

@Processor('whatsapp-outbound')
export class WhatsAppOutboundProcessor {
  private readonly logger = new Logger(WhatsAppOutboundProcessor.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Processes a single outbound WhatsApp message job.
   *
   * Delegates to WhatsAppService.sendMessage() which handles 360dialog API
   * communication and persists the outbound message to the Message table.
   *
   * @param job - BullMQ job containing recipient phone, message content, and church ID
   * @returns Void — message sent via WhatsAppService (360dialog API)
   * @throws Error if WhatsApp API is not configured or send fails (triggers retry)
   */
  @Process('send')
  async handleSend(
    job: Job<{ to: string; message: string; churchId: string; memberId?: string }>,
  ): Promise<void> {
    const { to, message, churchId, memberId } = job.data;
    this.logger.log(`Processing WhatsApp message to ${to} (job ${job.id})`);

    await this.whatsappService.sendMessage(to, message, churchId, memberId);

    this.logger.log(`WhatsApp message sent to ${to} (job ${job.id})`);
  }

  /**
   * Handles job completion for observability logging.
   *
   * @param job - The completed BullMQ job
   */
  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.log(`WhatsApp job ${job.id} completed → ${job.data.to}`);
  }

  /**
   * Handles job failure with attempt tracking.
   *
   * Logs the failure reason and current attempt number. After 3 failed attempts
   * the job moves to the failed set for manual inspection.
   *
   * @param job - The failed BullMQ job
   * @param error - The error that caused the failure
   */
  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `WhatsApp job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    );
  }
}
