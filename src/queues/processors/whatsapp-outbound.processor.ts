/**
 * @file whatsapp-outbound.processor.ts
 * @description BullMQ processor for outbound WhatsApp messages.
 *
 * Handles jobs from the 'whatsapp-outbound' queue. Each job contains
 * a recipient phone number, message content, and church ID for tenant scoping.
 * Integrates with WhatsAppService to send via the 360dialog Cloud API.
 *
 * @module queues/processors/whatsapp-outbound.processor
 * @since 1.0.0
 */

import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('whatsapp-outbound')
export class WhatsAppOutboundProcessor {
  private readonly logger = new Logger(WhatsAppOutboundProcessor.name);

  /**
   * Processes a single outbound WhatsApp message job.
   *
   * @param job - BullMQ job containing recipient phone, message content, and church ID
   * @returns Void — message sent via WhatsAppService (360dialog API)
   */
  @Process('send')
  async handleSend(job: Job<{ to: string; message: string; churchId: string }>): Promise<void> {
    this.logger.log(`Processing WhatsApp message to ${job.data.to}`);
    // TODO: integrate with WhatsAppService.sendOutboundMessage()
  }
}
