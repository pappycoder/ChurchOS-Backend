/**
 * @file life-event-response.dto.ts
 * @description Response DTO for life event data.
 *
 * @module pastoral/dto/life-event-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LifeEventResponseDto {
  @ApiProperty({ description: 'Unique event identifier' })
  id!: string;

  @ApiProperty({ description: 'Multi-tenant church scope' })
  churchId!: string;

  @ApiProperty({ description: 'Associated member reference' })
  memberId!: string;

  @ApiProperty({ description: 'Member first name for display' })
  memberFirstName!: string;

  @ApiProperty({ description: 'Member last name for display' })
  memberLastName!: string;

  @ApiProperty({ description: 'Recognized life event type' })
  type!: string;

  @ApiProperty({ description: 'ISO date of the event' })
  date!: string;

  @ApiPropertyOptional({ description: 'Optional structured details for the life event' })
  details?: Record<string, unknown>;

  @ApiProperty({ description: 'Whether a greeting notification was sent' })
  notified!: boolean;

  @ApiPropertyOptional({ description: 'Set when the record is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt!: string;
}
