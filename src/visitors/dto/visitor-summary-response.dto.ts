/**
 * @file Visitor summary response DTO.
 * @module visitors/dto/visitor-summary-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class VisitorSummaryResponseDto {
  @ApiProperty({ description: 'Total active (non-archived) visitors', example: 120 })
  total!: number;

  @ApiProperty({ description: 'New visitors since the start of the current month', example: 14 })
  newThisMonth!: number;

  @ApiProperty({ description: 'Visitors currently in an active follow-up funnel', example: 38 })
  inFollowUp!: number;

  @ApiProperty({ description: 'Visitors who have been converted to members', example: 22 })
  converted!: number;
}
