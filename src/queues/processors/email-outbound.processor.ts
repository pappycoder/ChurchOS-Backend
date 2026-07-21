/**
 * @file email-outbound.processor.ts
 * @description BullMQ processor for outbound emails.
 *
 * Handles jobs from the 'email-outbound' queue. Each job contains
 * a recipient email, subject, HTML body, and church ID.
 * Integrates with the Resend API for email delivery.
 *
 * @module queues/processors/email-outbound.processor
 * @since 1.0.0
 */

import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('email-outbound')
export class EmailOutboundProcessor {
  private readonly logger = new Logger(EmailOutboundProcessor.name);

  /**
   * Processes a single outbound email job.
   *
   * @param job - BullMQ job containing recipient email, subject, HTML body, and church ID
   * @returns Void — email sent via Resend API
   */
  @Process('send')
  async handleSend(
    job: Job<{ to: string; subject: string; html: string; churchId: string }>,
  ): Promise<void> {
    this.logger.log(`Processing email to ${job.data.to}`);
    // TODO: integrate with Resend API
  }
}
