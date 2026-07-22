/**
 * @file nightly-jobs.processor.ts
 * @description BullMQ processor for scheduled nightly maintenance jobs.
 *
 * Handles jobs from the 'nightly-jobs' queue. Runs church-wide
 * maintenance tasks including:
 * - Recalculating member engagement scores
 * - Recalculating member risk scores
 * - Identifying members needing pastoral attention
 * - Dispatching due recurring giving charges
 *
 * @module queues/processors/nightly-jobs.processor
 * @since 1.0.0
 */

import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ScoringService } from '../../pastoral/scoring.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('nightly-jobs')
export class NightlyJobsProcessor {
  private readonly logger = new Logger(NightlyJobsProcessor.name);

  constructor(
    private readonly scoringService: ScoringService,
    private readonly prisma: PrismaService,
    @InjectQueue('recurring-giving') private readonly recurringQueue: Queue,
  ) {}

  /**
   * Runs scheduled nightly maintenance tasks for a church.
   *
   * Recalculates engagement and risk scores for all active members,
   * identifies members needing pastoral attention, and dispatches
   * any due recurring giving charges.
   *
   * @param job - BullMQ job containing church ID
   * @returns Job result with scoring and recurring charge summary
   */
  @Process('run')
  async handleRun(job: Job<{ churchId: string }>): Promise<{
    engagementScored: number;
    riskScored: number;
    membersNeedingAttention: number;
    recurringChargesDispatched: number;
  }> {
    const { churchId } = job.data;

    this.logger.log(`Running nightly jobs for church ${churchId}`);

    const engagementScored = await this.scoringService.calculateEngagementScores(churchId);
    await job.updateProgress(25);

    const riskScored = await this.scoringService.calculateRiskScores(churchId);
    await job.updateProgress(50);

    const attention = await this.scoringService.getMembersNeedingAttention(churchId, 50);
    await job.updateProgress(75);

    const recurringChargesDispatched = await this.dispatchRecurringCharges(churchId);
    await job.updateProgress(100);

    this.logger.log(
      `Nightly jobs complete for church ${churchId}: ` +
        `${engagementScored} engagement, ${riskScored} risk, ` +
        `${attention.length} needing attention, ${recurringChargesDispatched} recurring charges dispatched`,
    );

    return {
      engagementScored,
      riskScored,
      membersNeedingAttention: attention.length,
      recurringChargesDispatched,
    };
  }

  /**
   * Queries for due recurring giving charges and dispatches them to the
   * recurring-giving queue for processing.
   *
   * @param churchId - Church ID to scope the query
   * @returns Number of charges dispatched
   */
  private async dispatchRecurringCharges(churchId: string): Promise<number> {
    const now = new Date();

    const dueCharges = await this.prisma.recurringGiving.findMany({
      where: {
        church_id: churchId,
        is_active: true,
        authorization_code: { not: null },
        next_charge_date: { lte: now },
      },
    });

    for (const recurring of dueCharges) {
      await this.recurringQueue.add(
        'charge',
        {
          recurringGivingId: recurring.id,
          churchId,
        },
        {
          jobId: `recurring-${recurring.id}-${now.toISOString().split('T')[0]}`,
        },
      );
    }

    if (dueCharges.length > 0) {
      this.logger.log(`Dispatched ${dueCharges.length} recurring charges for church ${churchId}`);
    }

    return dueCharges.length;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Nightly jobs job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    );
  }
}
