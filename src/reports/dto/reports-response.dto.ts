/**
 * @file reports-response.dto.ts
 * @description Response DTOs for report endpoints.
 *
 * @module reports/dto/reports-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class CategoryBreakdownDto {
  @ApiProperty({ description: 'Category name', example: 'Tithe' })
  name!: string;

  @ApiProperty({ description: 'Total amount in category', example: 1500000 })
  total!: number;

  @ApiProperty({ description: 'Number of transactions', example: 45 })
  count!: number;
}

export class MonthlyTrendDto {
  @ApiProperty({ description: 'Month (YYYY-MM)', example: '2026-07' })
  month!: string;

  @ApiProperty({ description: 'Total for the month', example: 850000 })
  total!: number;
}

export class FinancialReportDto {
  @ApiProperty({ description: 'Report period start date' })
  startDate!: string;

  @ApiProperty({ description: 'Report period end date' })
  endDate!: string;

  @ApiProperty({ description: 'Grand total of all giving', example: 5200000 })
  grandTotal!: number;

  @ApiProperty({ description: 'Total number of transactions', example: 320 })
  transactionCount!: number;

  @ApiProperty({ description: 'Average transaction amount', example: 16250 })
  averageAmount!: number;

  @ApiProperty({ description: 'Breakdown by category', type: [CategoryBreakdownDto] })
  byCategory!: CategoryBreakdownDto[];

  @ApiProperty({ description: 'Monthly trend data', type: [MonthlyTrendDto] })
  monthlyTrend!: MonthlyTrendDto[];
}

export class ServiceAttendanceDto {
  @ApiProperty({ description: 'Service name', example: 'Sunday Worship' })
  name!: string;

  @ApiProperty({ description: 'Total check-ins', example: 250 })
  total!: number;

  @ApiProperty({ description: 'Number of services held', example: 12 })
  serviceCount!: number;

  @ApiProperty({ description: 'Average per service', example: 20.8 })
  average!: number;
}

export class AttendanceReportDto {
  @ApiProperty({ description: 'Report period start date' })
  startDate!: string;

  @ApiProperty({ description: 'Report period end date' })
  endDate!: string;

  @ApiProperty({ description: 'Total attendance across all services', example: 3000 })
  totalAttendance!: number;

  @ApiProperty({ description: 'Number of services held', example: 24 })
  serviceCount!: number;

  @ApiProperty({ description: 'Average attendance per service', example: 125 })
  averagePerService!: number;

  @ApiProperty({ description: 'Breakdown by service type', type: [ServiceAttendanceDto] })
  byService!: ServiceAttendanceDto[];

  @ApiProperty({ description: 'Monthly trend data', type: [MonthlyTrendDto] })
  monthlyTrend!: MonthlyTrendDto[];
}

export class MemberStatusDto {
  @ApiProperty({ description: 'Member status', example: 'active' })
  status!: string;

  @ApiProperty({ description: 'Count of members with this status', example: 450 })
  count!: number;
}

export class MemberGenderDto {
  @ApiProperty({ description: 'Gender', example: 'male' })
  gender!: string;

  @ApiProperty({ description: 'Count', example: 230 })
  count!: number;
}

export class MemberReportDto {
  @ApiProperty({ description: 'Total members', example: 500 })
  totalMembers!: number;

  @ApiProperty({ description: 'Members added in period', example: 25 })
  newMembersInPeriod!: number;

  @ApiProperty({ description: 'Active members', example: 420 })
  activeMembers!: number;

  @ApiProperty({ description: 'Breakdown by status', type: [MemberStatusDto] })
  byStatus!: MemberStatusDto[];

  @ApiProperty({ description: 'Breakdown by gender', type: [MemberGenderDto] })
  byGender!: MemberGenderDto[];

  @ApiProperty({ description: 'Monthly growth trend', type: [MonthlyTrendDto] })
  monthlyGrowth!: MonthlyTrendDto[];
}
