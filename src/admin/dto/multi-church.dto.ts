/**
 * @file multi-church.dto.ts
 * @description DTOs for multi-church federation endpoints.
 *
 * @module admin/dto/multi-church.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChurchSummaryDto {
  @ApiProperty({ description: 'Church UUID' })
  id!: string;

  @ApiProperty({ description: 'Church name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Denomination' })
  denomination?: string;

  @ApiPropertyOptional({ description: 'City' })
  city?: string;

  @ApiPropertyOptional({ description: 'State' })
  state?: string;

  @ApiProperty({ description: 'Total members count' })
  memberCount!: number;

  @ApiProperty({ description: 'Active members count' })
  activeMemberCount!: number;

  @ApiProperty({ description: 'Total branches count' })
  branchCount!: number;

  @ApiProperty({ description: 'Total transactions this month (NGN)' })
  monthlyGivingTotal!: number;

  @ApiProperty({ description: 'Admin first name' })
  adminName!: string;

  @ApiProperty({ description: 'Admin email' })
  adminEmail!: string;

  @ApiProperty({ description: 'ISO timestamp of creation' })
  createdAt!: string;
}

export class CrossChurchAnalyticsDto {
  @ApiProperty({ description: 'Total churches managed' })
  totalChurches!: number;

  @ApiProperty({ description: 'Total members across all churches' })
  totalMembers!: number;

  @ApiProperty({ description: 'Total active members across all churches' })
  totalActiveMembers!: number;

  @ApiProperty({ description: 'Total branches across all churches' })
  totalBranches!: number;

  @ApiProperty({ description: 'Total giving volume this month (NGN)' })
  totalMonthlyGiving!: number;

  @ApiProperty({ description: 'Average members per church' })
  averageMembersPerChurch!: number;

  @ApiProperty({ description: 'Average giving per church this month (NGN)' })
  averageGivingPerChurch!: number;

  @ApiProperty({ type: [ChurchSummaryDto], description: 'All churches summary' })
  churches!: ChurchSummaryDto[];
}
