/**
 * @file scoring.service.ts
 * @description Service for calculating member engagement and risk scores.
 *
 * Engagement Score (0-100): Measures how actively a member participates.
 * Factors: attendance frequency, giving activity, event participation,
 * communication engagement (WhatsApp messages).
 *
 * Risk Score (0-100): Measures likelihood of member disengagement.
 * Factors: declining attendance, no giving activity, no communication,
 * inactive status, age of last activity.
 *
 * Both scores are recalculated nightly via the BullMQ nightly-jobs queue.
 * Results are stored in the engagement_scores and risk_scores tables.
 *
 * @module pastoral/scoring.service
 * @since 1.0.0
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Weight configuration for engagement score factors.
 */
const ENGAGEMENT_WEIGHTS = {
  attendance: 30,
  giving: 25,
  events: 20,
  communication: 15,
  consistency: 10,
};

/**
 * Weight configuration for risk score factors.
 * Higher risk score = more at risk of leaving.
 */
const RISK_WEIGHTS = {
  attendanceDecline: 25,
  noGiving: 20,
  noCommunication: 20,
  inactiveStatus: 15,
  recentInactivity: 20,
};

/**
 * Number of weeks to look back for scoring calculations.
 */
const LOOKBACK_WEEKS = 12;

@Injectable()
export class ScoringService {
  // Initialize the logger for this service
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    // Inject PrismaService for database access
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Calculates engagement scores for all active members in a church.
   *
   * @param churchId - Church ID to scope calculations
   * @returns Number of members scored
   */
  async calculateEngagementScores(churchId: string): Promise<number> {
    // Compute the lookback cutoff date (12 weeks ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_WEEKS * 7);

    // Fetch all active members for the church
    const members = await this.prisma.member.findMany({
      where: { church_id: churchId, status: 'active' },
      select: { id: true, first_name: true, last_name: true },
    });

    // Initialize the scored counter
    let scored = 0;

    // Iterate over each member to calculate their engagement score
    for (const member of members) {
      try {
        // Calculate individual engagement factor values for the member
        const factors = await this.calculateEngagementFactors(member.id, churchId, cutoffDate);

        // Compute the weighted engagement score from factors
        const score = this.computeWeightedScore(factors, ENGAGEMENT_WEIGHTS);

        // Upsert the engagement score record (update or create)
        await this.prisma.engagementScore.upsert({
          where: { member_id: member.id },
          update: {
            score,
            factors: factors as unknown as Prisma.InputJsonValue,
            calculated_at: new Date(),
          },
          create: {
            church_id: churchId,
            member_id: member.id,
            score,
            factors: factors as unknown as Prisma.InputJsonValue,
          },
        });

        // Increment the scored counter
        scored++;
      } catch (error) {
        // Log errors but continue processing other members
        this.logger.error(`Failed to calculate engagement for ${member.id}: ${error}`);
      }
    }

    // Log the total number of members scored and return the count
    this.logger.log(`Engagement scores calculated for ${scored} members in church ${churchId}`);
    return scored;
  }

  /**
   * Calculates risk scores for all active members in a church.
   *
   * @param churchId - Church ID to scope calculations
   * @returns Number of members scored
   */
  async calculateRiskScores(churchId: string): Promise<number> {
    // Compute the lookback cutoff date (12 weeks ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_WEEKS * 7);

    // Fetch all members for the church (including inactive)
    const members = await this.prisma.member.findMany({
      where: { church_id: churchId },
      select: { id: true, status: true },
    });

    // Initialize the scored counter
    let scored = 0;

    // Iterate over each member to calculate their risk score
    for (const member of members) {
      try {
        // Calculate individual risk factor values for the member
        const factors = await this.calculateRiskFactors(
          member.id,
          churchId,
          member.status,
          cutoffDate,
        );

        // Compute the weighted risk score from factors
        const score = this.computeWeightedScore(factors, RISK_WEIGHTS);
        // Map the numeric score to a risk level label
        const level = this.getRiskLevel(score);

        // Upsert the risk score record (update or create)
        await this.prisma.riskScore.upsert({
          where: { member_id: member.id },
          update: {
            score,
            level,
            factors: factors as unknown as Prisma.InputJsonValue,
            calculated_at: new Date(),
          },
          create: {
            church_id: churchId,
            member_id: member.id,
            score,
            level,
            factors: factors as unknown as Prisma.InputJsonValue,
          },
        });

        // Increment the scored counter
        scored++;
      } catch (error) {
        // Log errors but continue processing other members
        this.logger.error(`Failed to calculate risk for ${member.id}: ${error}`);
      }
    }

    // Log the total number of members scored and return the count
    this.logger.log(`Risk scores calculated for ${scored} members in church ${churchId}`);
    return scored;
  }

  /**
   * Gets members who need pastoral attention (high/critical risk).
   *
   * @param churchId - Church ID
   * @param limit - Max results
   * @returns Members with risk scores
   */
  async getMembersNeedingAttention(churchId: string, limit = 20) {
    // Query risk scores filtered to high/critical levels, ordered by highest score first
    return this.prisma.riskScore.findMany({
      where: {
        church_id: churchId,
        level: { in: ['high', 'critical'] },
      },
      include: {
        member: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: { score: 'desc' },
      take: limit,
    });
  }

  /**
   * Gets engagement distribution across the church.
   *
   * @param churchId - Church ID
   * @returns Distribution counts by engagement level
   */
  async getEngagementDistribution(churchId: string): Promise<{
    highly_engaged: number;
    moderately_engaged: number;
    low_engagement: number;
    disengaged: number;
  }> {
    // Count members in each engagement tier in parallel
    const [highlyEngaged, moderatelyEngaged, lowEngagement, disengaged] = await Promise.all([
      this.prisma.engagementScore.count({
        where: { church_id: churchId, score: { gte: 70 } },
      }),
      this.prisma.engagementScore.count({
        where: { church_id: churchId, score: { gte: 40, lt: 70 } },
      }),
      this.prisma.engagementScore.count({
        where: { church_id: churchId, score: { gte: 20, lt: 40 } },
      }),
      this.prisma.engagementScore.count({
        where: { church_id: churchId, score: { lt: 20 } },
      }),
    ]);

    // Return the distribution as a structured object
    return {
      highly_engaged: highlyEngaged,
      moderately_engaged: moderatelyEngaged,
      low_engagement: lowEngagement,
      disengaged: disengaged,
    };
  }

  /**
   * Gets "rising stars" — members with rapidly improving engagement.
   *
   * @param churchId - Church ID
   * @param limit - Max results
   * @returns Top engaging members
   */
  async getRisingStars(churchId: string, limit = 10) {
    // Query high-scoring engagement records ordered by score descending
    return this.prisma.engagementScore.findMany({
      where: {
        church_id: churchId,
        score: { gte: 50 },
      },
      include: {
        member: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
      orderBy: { score: 'desc' },
      take: limit,
    });
  }

  // ─── Private: Engagement Factor Calculations ───────────────

  /**
   * Calculates individual engagement factor values for a member.
   *
   * @param memberId - Member ID
   * @param churchId - Church ID
   * @param cutoffDate - Start of lookback period
   * @returns Factor values (0-1 each)
   */
  private async calculateEngagementFactors(
    memberId: string,
    _churchId: string,
    cutoffDate: Date,
  ): Promise<Record<string, number>> {
    // Fetch all raw activity data in parallel for the lookback period
    const [attendanceCount, givingCount, givingTotal, eventCount, messageCount] = await Promise.all(
      [
        this.prisma.attendance.count({
          where: {
            member_id: memberId,
            checkin_at: { gte: cutoffDate },
          },
        }),
        this.prisma.transaction.count({
          where: {
            member_id: memberId,
            status: 'success',
            created_at: { gte: cutoffDate },
          },
        }),
        this.prisma.transaction.aggregate({
          where: {
            member_id: memberId,
            status: 'success',
            created_at: { gte: cutoffDate },
          },
          _sum: { amount: true },
        }),
        this.prisma.eventRegistration.count({
          where: {
            member_id: memberId,
            created_at: { gte: cutoffDate },
          },
        }),
        this.prisma.message.count({
          where: {
            member_id: memberId,
            direction: 'outbound',
            created_at: { gte: cutoffDate },
          },
        }),
      ],
    );

    // Compute the total number of weeks in the lookback window
    const totalWeeks = LOOKBACK_WEEKS;

    // Normalize each raw count to a 0-1 factor value
    return {
      // Attendance: check-ins per expected services (0.5 services/week × 12 weeks = 6)
      attendance: Math.min(attendanceCount / (totalWeeks * 0.5), 1),
      // Giving: weighted by frequency (0.2 per tx) and total amount (÷ 500k)
      giving: Math.min(givingCount * 0.2 + (givingTotal._sum.amount || 0) / 500000, 1),
      // Events: register for up to 5 events in the period
      events: Math.min(eventCount / 5, 1),
      // Communication: up to 10 outbound messages
      communication: Math.min(messageCount / 10, 1),
      // Consistency: attendance relative to 70% of possible services
      consistency: Math.min(attendanceCount / (totalWeeks * 0.7), 1),
    };
  }

  // ─── Private: Risk Factor Calculations ─────────────────────

  /**
   * Calculates individual risk factor values for a member.
   *
   * @param memberId - Member ID
   * @param churchId - Church ID
   * @param memberStatus - Member status
   * @param cutoffDate - Start of lookback period
   * @returns Factor values (0-1 each, higher = more risk)
   */
  private async calculateRiskFactors(
    memberId: string,
    _churchId: string,
    memberStatus: string,
    cutoffDate: Date,
  ): Promise<Record<string, number>> {
    // Fetch raw activity data and last activity in parallel
    const [recentAttendance, recentGiving, recentMessages, lastActivity] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          member_id: memberId,
          checkin_at: { gte: cutoffDate },
        },
      }),
      this.prisma.transaction.count({
        where: {
          member_id: memberId,
          status: 'success',
          created_at: { gte: cutoffDate },
        },
      }),
      this.prisma.message.count({
        where: {
          member_id: memberId,
          created_at: { gte: cutoffDate },
        },
      }),
      this.prisma.attendance.findFirst({
        where: { member_id: memberId },
        orderBy: { checkin_at: 'desc' },
        select: { checkin_at: true },
      }),
    ]);

    // Compute the total number of weeks in the lookback window
    const totalWeeks = LOOKBACK_WEEKS;

    // Calculate weeks since last attendance, capped at totalWeeks
    const weeksSinceLastActivity = lastActivity
      ? Math.min(
          (Date.now() - lastActivity.checkin_at.getTime()) / (7 * 24 * 60 * 60 * 1000),
          totalWeeks,
        )
      : totalWeeks;

    // Compute risk factors (higher value = more risk)
    return {
      // Attendance decline: inverse of recent attendance ratio
      attendanceDecline: Math.max(1 - recentAttendance / (totalWeeks * 0.5), 0),
      // No giving: binary risk factor (1 if zero giving, 0 otherwise)
      noGiving: recentGiving === 0 ? 1 : 0,
      // No communication: binary risk factor
      noCommunication: recentMessages === 0 ? 1 : 0,
      // Inactive status: binary risk factor (1 if not active)
      inactiveStatus: memberStatus !== 'active' ? 1 : 0,
      // Recent inactivity: fraction of lookback period since last activity
      recentInactivity: weeksSinceLastActivity / totalWeeks,
    };
  }

  // ─── Private: Helpers ──────────────────────────────────────

  /**
   * Computes a weighted score from factors and weights.
   *
   * @param factors - Factor values (0-1)
   * @param weights - Weight percentages (must sum to 100)
   * @returns Score 0-100
   */
  private computeWeightedScore(
    factors: Record<string, number>,
    weights: Record<string, number>,
  ): number {
    // Initialize accumulators for weighted sum and total weight
    let totalWeight = 0;
    let weightedSum = 0;

    // Iterate over each weight factor and accumulate weighted values
    for (const [key, weight] of Object.entries(weights)) {
      const factor = factors[key] || 0;
      weightedSum += factor * weight;
      totalWeight += weight;
    }

    // Normalize by total weight and scale to 0-100, rounded to integer
    return Math.round((weightedSum / totalWeight) * 100);
  }

  /**
   * Maps a numeric risk score to a RiskLevel enum value.
   *
   * @param score - Risk score (0-100)
   * @returns Risk level
   */
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    // Map score ranges to discrete risk levels
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }
}
