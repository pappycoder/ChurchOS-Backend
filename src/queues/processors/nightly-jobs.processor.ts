/**
 * @file nightly-jobs.processor.ts
 * @description BullMQ processor for scheduled nightly maintenance jobs.
 *
 * Handles jobs from the 'nightly-jobs' queue. Runs church-wide
 * maintenance tasks including:
 * - Recalculating member engagement scores
 * - Recalculating member risk scores
 * - Identifying members needing pastoral attention
 * - Generating daily attendance/giving summaries
 *
 * @module queues/processors/nightly-jobs.processor
 * @since 1.0.0
 */

import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoringService } from '../../pastoral/scoring.service';

@Processor('nightly-jobs')
export class NightlyJobsProcessor {
  private readonly logger = new Logger(NightlyJobsProcessor.name);

  constructor(private readonly scoringService: ScoringService) {}

  /**
   * Runs scheduled nightly maintenance tasks for a church.
   *
   * Recalculates engagement and risk scores for all active members,
   * then identifies members needing pastoral attention.
   *
   * @param job - BullMQ job containing church ID
   * @returns Job result with scoring summary
   */
  @Process('run')
  async handleRun(job: Job<{ churchId: string }>): Promise<{
    engagementScored: number;
    riskScored: number;
    membersNeedingAttention: number;
  }> {
    const { churchId } = job.data;

    // Log the start of nightly maintenance for audit trail
    this.logger.log(`Running nightly jobs for church ${churchId}`);

    // Calculate engagement scores for all active members
    const engagementScored = await this.scoringService.calculateEngagementScores(churchId);
    await job.updateProgress(33);

    // Calculate risk scores for all active members
    const riskScored = await this.scoringService.calculateRiskScores(churchId);
    await job.updateProgress(66);

    // Identify members needing pastoral attention (top 50)
    const attention = await this.scoringService.getMembersNeedingAttention(churchId, 50);
    await job.updateProgress(100);

    // Log completion summary for monitoring
    this.logger.log(
      `Nightly jobs complete for church ${churchId}: ` +
        `${engagementScored} engagement, ${riskScored} risk, ` +
        `${attention.length} needing attention`,
    );

    // Return scoring summary as job result
    return {
      engagementScored,
      riskScored,
      membersNeedingAttention: attention.length,
    };
  }
}
