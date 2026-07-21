/**
 * @file analytics-response.dto.ts
 * @description Response DTOs for the analytics module.
 *
 * Defines the shapes returned by dashboard and report endpoints.
 *
 * @module analytics/dto/analytics-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Breakdown of a numeric value by category.
 */
export class CategoryBreakdownDto {
  @ApiProperty({ description: 'Category ID' })
  categoryId!: string;

  @ApiProperty({ description: 'Category name' })
  categoryName!: string;

  @ApiProperty({ description: 'Total amount' })
  total!: number;

  @ApiProperty({ description: 'Number of records' })
  count!: number;
}

/**
 * Breakdown of a numeric value by branch.
 */
export class BranchBreakdownDto {
  @ApiPropertyOptional({ description: 'Branch ID' })
  branchId?: string;

  @ApiProperty({ description: 'Branch name' })
  branchName!: string;

  @ApiProperty({ description: 'Total amount' })
  total!: number;

  @ApiProperty({ description: 'Number of records' })
  count!: number;
}

/**
 * Breakdown of a numeric value by transaction type.
 */
export class TypeBreakdownDto {
  @ApiProperty({ description: 'Transaction type' })
  type!: string;

  @ApiProperty({ description: 'Total amount' })
  total!: number;

  @ApiProperty({ description: 'Number of records' })
  count!: number;
}

/**
 * Top donor entry.
 */
export class TopDonorDto {
  @ApiProperty({ description: 'Member ID' })
  memberId!: string;

  @ApiProperty({ description: 'Member full name' })
  memberName!: string;

  @ApiProperty({ description: 'Total giving amount' })
  total!: number;

  @ApiProperty({ description: 'Number of gifts' })
  count!: number;
}

/**
 * Daily data point for trends.
 */
export class DatePointDto {
  @ApiProperty({ description: 'Date or period label', example: '2026-07-01' })
  date!: string;

  @ApiProperty({ description: 'Total value' })
  total!: number;

  @ApiProperty({ description: 'Member value' })
  members!: number;

  @ApiProperty({ description: 'Visitor or non-member value' })
  visitors!: number;
}

/**
 * Attendance breakdown by service.
 */
export class ServiceBreakdownDto {
  @ApiProperty({ description: 'Service ID' })
  serviceId!: string;

  @ApiProperty({ description: 'Service name' })
  serviceName!: string;

  @ApiProperty({ description: 'Total check-ins' })
  total!: number;

  @ApiProperty({ description: 'Member check-ins' })
  members!: number;

  @ApiProperty({ description: 'Visitor check-ins' })
  visitors!: number;
}

/**
 * Event summary for analytics.
 */
export class EventSummaryDto {
  @ApiProperty({ description: 'Event ID' })
  eventId!: string;

  @ApiProperty({ description: 'Event title' })
  title!: string;

  @ApiProperty({ description: 'Event start date', example: '2026-07-01T10:00:00.000Z' })
  startDate!: string;

  @ApiProperty({ description: 'Total registrations' })
  registrations!: number;

  @ApiPropertyOptional({ description: 'Event capacity' })
  capacity?: number;

  @ApiProperty({ description: 'Total revenue from tickets' })
  revenue!: number;

  @ApiProperty({ description: 'Whether the event is free' })
  isFree!: boolean;
}

/**
 * Ticket tier breakdown for an event.
 */
export class TierBreakdownDto {
  @ApiProperty({ description: 'Tier name' })
  tierName!: string;

  @ApiProperty({ description: 'Tier price' })
  price!: number;

  @ApiProperty({ description: 'Tickets sold' })
  sold!: number;

  @ApiProperty({ description: 'Revenue from tier' })
  revenue!: number;

  @ApiPropertyOptional({ description: 'Tier capacity' })
  capacity?: number;
}

/**
 * Message delivery statistics by channel.
 */
export class ChannelStatsDto {
  @ApiProperty({ description: 'Communication channel', example: 'whatsapp' })
  channel!: string;

  @ApiProperty({ description: 'Messages sent' })
  sent!: number;

  @ApiProperty({ description: 'Messages delivered' })
  delivered!: number;

  @ApiProperty({ description: 'Messages read' })
  read!: number;

  @ApiProperty({ description: 'Messages failed' })
  failed!: number;

  @ApiProperty({ description: 'Total messages' })
  total!: number;
}

/**
 * Broadcast campaign summary.
 */
export class BroadcastSummaryDto {
  @ApiProperty({ description: 'Total broadcast campaigns' })
  total!: number;

  @ApiProperty({ description: 'Sent campaigns' })
  sent!: number;

  @ApiProperty({ description: 'Failed campaigns' })
  failed!: number;

  @ApiProperty({ description: 'Total recipients' })
  totalRecipients!: number;
}

/**
 * Dashboard overview response.
 */
export class DashboardResponseDto {
  @ApiProperty({ description: 'Total members' })
  totalMembers!: number;

  @ApiProperty({ description: 'Active members' })
  activeMembers!: number;

  @ApiProperty({ description: 'New members within the date range' })
  newMembers!: number;

  @ApiProperty({ description: 'Total branches' })
  totalBranches!: number;

  @ApiProperty({ description: 'Total check-ins within the date range' })
  totalAttendance!: number;

  @ApiProperty({ description: 'Total successful giving within the date range' })
  totalGiving!: number;

  @ApiProperty({ description: 'Members flagged as high or critical risk' })
  atRiskCount!: number;

  @ApiProperty({ description: 'Upcoming events within the date range' })
  upcomingEvents!: number;

  @ApiProperty({ description: 'Pending form submissions' })
  pendingSubmissions!: number;

  @ApiProperty({ description: 'Engagement score distribution', type: 'object' })
  engagementDistribution!: Record<string, number>;
}

/**
 * Giving analytics response.
 */
export class GivingAnalyticsResponseDto {
  @ApiProperty({ description: 'Total successful giving amount' })
  total!: number;

  @ApiProperty({ description: 'Total successful transaction count' })
  count!: number;

  @ApiProperty({ description: 'Average gift amount' })
  average!: number;

  @ApiProperty({ description: 'Breakdown by giving category', type: [CategoryBreakdownDto] })
  byCategory!: CategoryBreakdownDto[];

  @ApiProperty({ description: 'Breakdown by branch', type: [BranchBreakdownDto] })
  byBranch!: BranchBreakdownDto[];

  @ApiProperty({ description: 'Breakdown by transaction type', type: [TypeBreakdownDto] })
  byType!: TypeBreakdownDto[];

  @ApiProperty({ description: 'Breakdown by transaction status', type: 'object' })
  byStatus!: Record<string, number>;

  @ApiProperty({ description: 'Top donors', type: [TopDonorDto] })
  topDonors!: TopDonorDto[];

  @ApiProperty({ description: 'Recurring giving summary', type: 'object' })
  recurring!: {
    active: number;
    totalMonthlyAmount: number;
    totalScheduled: number;
  };

  @ApiProperty({ description: 'Daily giving trend', type: [DatePointDto] })
  trend!: DatePointDto[];
}

/**
 * Attendance analytics response.
 */
export class AttendanceAnalyticsResponseDto {
  @ApiProperty({ description: 'Total check-ins' })
  total!: number;

  @ApiProperty({ description: 'Member check-ins' })
  members!: number;

  @ApiProperty({ description: 'Visitor check-ins' })
  visitors!: number;

  @ApiProperty({ description: 'Breakdown by source', type: 'object' })
  bySource!: Record<string, number>;

  @ApiProperty({ description: 'Breakdown by branch', type: [BranchBreakdownDto] })
  byBranch!: BranchBreakdownDto[];

  @ApiProperty({ description: 'Breakdown by service', type: [ServiceBreakdownDto] })
  byService!: ServiceBreakdownDto[];

  @ApiProperty({ description: 'First-time visitors' })
  firstTimeVisitors!: number;

  @ApiProperty({ description: 'Returning visitors' })
  returningVisitors!: number;

  @ApiProperty({ description: 'Daily attendance trend', type: [DatePointDto] })
  trend!: DatePointDto[];
}

/**
 * Member demographics response.
 */
export class MemberAnalyticsResponseDto {
  @ApiProperty({ description: 'Total members' })
  total!: number;

  @ApiProperty({ description: 'Members by status', type: 'object' })
  byStatus!: Record<string, number>;

  @ApiProperty({ description: 'Members by gender', type: 'object' })
  byGender!: Record<string, number>;

  @ApiProperty({ description: 'Members by age group', type: 'object' })
  byAgeGroup!: Record<string, number>;

  @ApiProperty({ description: 'Monthly member growth', type: [DatePointDto] })
  growth!: DatePointDto[];
}

/**
 * Event analytics response.
 */
export class EventAnalyticsResponseDto {
  @ApiProperty({ description: 'Total events' })
  totalEvents!: number;

  @ApiProperty({ description: 'Total registrations' })
  totalRegistrations!: number;

  @ApiProperty({ description: 'Total capacity across events' })
  totalCapacity!: number;

  @ApiProperty({ description: 'Total ticket revenue' })
  totalRevenue!: number;

  @ApiProperty({ description: 'Number of free events' })
  freeEvents!: number;

  @ApiProperty({ description: 'Number of paid events' })
  paidEvents!: number;

  @ApiProperty({ description: 'Per-event summary', type: [EventSummaryDto] })
  events!: EventSummaryDto[];

  @ApiProperty({ description: 'Ticket tier breakdown', type: [TierBreakdownDto] })
  tiers!: TierBreakdownDto[];
}

/**
 * Communication analytics response.
 */
export class CommunicationAnalyticsResponseDto {
  @ApiProperty({ description: 'Message statistics by channel', type: [ChannelStatsDto] })
  channels!: ChannelStatsDto[];

  @ApiProperty({ description: 'Broadcast campaign summary', type: BroadcastSummaryDto })
  broadcasts!: BroadcastSummaryDto;
}
