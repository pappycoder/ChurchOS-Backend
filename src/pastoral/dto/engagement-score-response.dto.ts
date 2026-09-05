/**
 * @file engagement-score-response.dto.ts
 * @description Response DTO for member engagement score data.
 *
 * @module pastoral/dto/engagement-score-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EngagementScoreResponseDto {
  @ApiProperty({ description: 'Unique engagement record identifier' })
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

  @ApiProperty({ description: 'Engagement score (0-100, higher = more engaged)' })
  score!: number;

  @ApiProperty({ description: 'Individual engagement factor contributions (0-1 each)' })
  factors!: Record<string, number>;

  @ApiProperty({ description: 'When the score was last calculated' })
  calculatedAt!: string;
}
