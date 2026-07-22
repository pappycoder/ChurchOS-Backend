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
import { PastoralService } from '../../pastoral/pastoral.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('nightly-jobs')
export class NightlyJobsProcessor {
  private readonly logger = new Logger(NightlyJobsProcessor.name);

  constructor(
    private readonly scoringService: ScoringService,
    private readonly pastoralService: PastoralService,
    private readonly whatsappService: WhatsAppService,
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
    lifeEventGreetingsSent: number;
  }> {
    const { churchId } = job.data;

    this.logger.log(`Running nightly jobs for church ${churchId}`);

    const engagementScored = await this.scoringService.calculateEngagementScores(churchId);
    await job.updateProgress(20);

    const riskScored = await this.scoringService.calculateRiskScores(churchId);
    await job.updateProgress(40);

    const attention = await this.scoringService.getMembersNeedingAttention(churchId, 50);
    await job.updateProgress(55);

    const lifeEventGreetingsSent = await this.processLifeEventGreetings(churchId);
    await job.updateProgress(70);

    const recurringChargesDispatched = await this.dispatchRecurringCharges(churchId);
    await job.updateProgress(100);

    this.logger.log(
      `Nightly jobs complete for church ${churchId}: ` +
        `${engagementScored} engagement, ${riskScored} risk, ` +
        `${attention.length} needing attention, ` +
        `${lifeEventGreetingsSent} life event greetings sent, ` +
        `${recurringChargesDispatched} recurring charges dispatched`,
    );

    return {
      engagementScored,
      riskScored,
      membersNeedingAttention: attention.length,
      recurringChargesDispatched,
      lifeEventGreetingsSent,
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

  /**
   * Processes life event greetings for the upcoming day.
   *
   * Queries for un-notified life events happening tomorrow (birthdays,
   * wedding anniversaries, etc.) and sends automated WhatsApp greetings.
   *
   * Greeting messages are composed per event type:
   * - birthday: "Happy Birthday {name}! We celebrate you today. God bless you!"
   * - wedding: "Happy Wedding Anniversary {name}! May God continue to bless your union."
   * - dedication: "Remembering your child's dedication. God is faithful!"
   * - baptism: "Remembering your baptism! Walking in newness of life."
   * - death: "Thinking of you as we remember your loved one. May God comfort you."
   *
   * @param churchId - Church ID to scope the query
   * @returns Number of greeting messages sent
   */
  private async processLifeEventGreetings(churchId: string): Promise<number> {
    try {
      // Look 1 day ahead for events happening tomorrow
      const upcomingEvents = await this.pastoralService.getUpcomingLifeEvents(churchId, 1);

      if (upcomingEvents.length === 0) {
        return 0;
      }

      let sentCount = 0;

      for (const event of upcomingEvents) {
        try {
          const member = await this.prisma.member.findUnique({
            where: { id: event.memberId },
            select: {
              first_name: true,
              last_name: true,
              whatsapp_number: true,
              phone: true,
            },
          });

          if (!member) {
            this.logger.warn(`Life event ${event.id}: member ${event.memberId} not found`);
            await this.pastoralService.markLifeEventNotified(event.id);
            continue;
          }

          const greeting = this.composeLifeEventGreeting(event.type, member.first_name);
          if (!greeting) {
            await this.pastoralService.markLifeEventNotified(event.id);
            continue;
          }

          const recipientPhone = member.whatsapp_number || member.phone;
          if (!recipientPhone) {
            this.logger.warn(`Life event ${event.id}: member ${member.first_name} has no phone`);
            await this.pastoralService.markLifeEventNotified(event.id);
            continue;
          }

          await this.whatsappService.sendMessage(recipientPhone, greeting, churchId, undefined);

          await this.pastoralService.markLifeEventNotified(event.id);
          sentCount++;

          this.logger.log(
            `Life event greeting sent: ${event.type} → ${member.first_name} ${member.last_name} (${recipientPhone})`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send life event greeting for ${event.id}: ${(err as Error).message}`,
          );
          // Still mark as notified to avoid repeated failures
          await this.pastoralService.markLifeEventNotified(event.id).catch(() => {});
        }
      }

      return sentCount;
    } catch (err) {
      this.logger.error(
        `Life event greetings processing failed for church ${churchId}: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Composes a WhatsApp greeting message based on life event type.
   *
   * @param eventType - Type of life event (birthday, wedding, etc.)
   * @param memberName - Member's first name for personalization
   * @returns Greeting message or null if the event type doesn't warrant a greeting
   */
  private composeLifeEventGreeting(eventType: string, memberName: string): string | null {
    const greetings: Record<string, string> = {
      birthday: `🎂 *Happy Birthday, ${memberName}!* 🎉\n\nWe celebrate you today! May God bless you with joy, peace, and favor in the year ahead. We're so grateful to have you as part of our church family! 🙏`,
      wedding: `💍 *Happy Wedding Anniversary, ${memberName}!* 💐\n\nMay God continue to bless your union with love, joy, and strength. We celebrate the covenant God has made in your marriage!`,
      dedication: `🙏 *Remembering Your Child's Dedication*\n\nDear ${memberName}, we pray that God continues to guide and protect your family. Your commitment to raising your child in the Lord is a beautiful testimony!`,
      baptism: `✝️ *Remembering Your Baptism*\n\nDear ${memberName}, as we remember your baptism, we celebrate your walk with Christ. May you continue to grow in faith and be a light to others!`,
      anniversary: `🎉 *Happy Anniversary, ${memberName}!* 🎊\n\nWe celebrate this special day with you! Thank you for being a valued member of our church family. God bless you abundantly!`,
    };

    return greetings[eventType] || null;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Nightly jobs job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    );
  }
}
