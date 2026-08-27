/**
 * @file risk-score-response.dto.ts
 * @description Response DTO for member risk score data.
 *
 * @module pastoral/dto/risk-score-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RiskScoreResponseDto {
  @ApiProperty({ description: 'Unique risk record identifier' })
  id!: string;

  @ApiProperty({ description: 'Multi-tenant church scope identifier' })
  churchId!: string;

  @ApiProperty({ description: 'Associated member reference ID' })
  memberId!: string;

  @ApiProperty({ description: 'Member first name for display' })
  memberFirstName!: string;

  @ApiProperty({ description: 'Member last name for display' })
  memberLastName!: string;

  @ApiPropertyOptional({ description: 'Member email contact', example: 'someone@example.com' })
  memberEmail?: string;

  @ApiPropertyOptional({ description: 'Member phone contact', example: '+2348012345678' })
  memberPhone?: string;

  @ApiPropertyOptional({ description: 'Member membership status', example: 'active' })
  memberStatus?: string;

  @ApiProperty({ description: 'Risk score (0-100, higher = more at risk)' })
  score!: number;

  @ApiProperty({
    description: 'Risk level classification',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  level!: string;

  @ApiProperty({ description: 'Individual risk factor contributions (0-1 each)' })
  factors!: Record<string, number>;

  @ApiProperty({ description: 'When the score was last calculated' })
  calculatedAt!: string;
}
