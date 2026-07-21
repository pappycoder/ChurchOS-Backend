/**
 * @file email-outbound.processor.ts
 * @description BullMQ processor for outbound emails.
 *
 * Handles jobs from the 'email-outbound' queue. Each job contains
 * a recipient email, subject, HTML body, and church ID.
 * Delegates to ResendService for delivery via the Resend API.
 *
 * Retry policy: 3 attempts with exponential backoff (5s base).
 *
 * @module queues/processors/email-outbound.processor
 * @since 1.0.0
 */

import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ResendService } from '../../communication/resend.service';

@Processor('email-outbound')
export class EmailOutboundProcessor {
  private readonly logger = new Logger(EmailOutboundProcessor.name);

  constructor(private readonly resendService: ResendService) {}

  /**
   * Processes a single outbound email job.
   *
   * Delegates to ResendService.sendEmail() which handles Resend API
   * communication and persists the outbound message to the Message table.
   *
   * @param job - BullMQ job containing recipient email, subject, HTML body, and church ID
   * @returns Void — email sent via ResendService (Resend API)
   * @throws Error if Resend API is not configured or send fails (triggers retry)
   */
  @Process('send')
  async handleSend(
    job: Job<{ to: string; subject: string; html: string; churchId: string }>,
  ): Promise<void> {
    const { to, subject, html, churchId } = job.data;
    this.logger.log(`Processing email to ${to} (job ${job.id})`);

    await this.resendService.sendEmail(to, subject, html, churchId);

    this.logger.log(`Email sent to ${to} (job ${job.id})`);
  }

  /**
   * Handles job completion for observability logging.
   *
   * @param job - The completed BullMQ job
   */
  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.log(`Email job ${job.id} completed → ${job.data.to}`);
  }

  /**
   * Handles job failure with attempt tracking.
   *
   * @param job - The failed BullMQ job
   * @param error - The error that caused the failure
   */
  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Email job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    );
  }
}
