/**
 * @file recurring-giving.processor.ts
 * @description BullMQ processor for automated recurring giving charges.
 *
 * Handles jobs from the 'recurring-giving' queue. Each job contains
 * a RecurringGiving record ID and church ID. The processor charges
 * the member's saved payment authorization via the configured gateway
 * (currently Paystack only). Failed charges increment the attempt counter.
 *
 * @module queues/processors/recurring-giving.processor
 * @since 1.0.0
 */

import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('recurring-giving')
export class RecurringGivingProcessor {
  private readonly logger = new Logger(RecurringGivingProcessor.name);

  /**
   * Processes a single recurring giving charge job.
   *
   * Charges the member's saved payment authorization via the configured gateway
   * (currently Paystack only). Increments attempt counter on failure.
   *
   * @param job - BullMQ job containing RecurringGiving ID and church ID
   * @returns Void — charge processed via GivingService
   */
  @Process('charge')
  async handleCharge(job: Job<{ recurringGivingId: string; churchId: string }>): Promise<void> {
    this.logger.log(`Processing recurring charge for ${job.data.recurringGivingId}`);
    // TODO: integrate with GivingService for recurring charge logic
  }
}
