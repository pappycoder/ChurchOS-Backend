/**
 * @file life-event-response.dto.ts
 * @description Response DTO for life event data.
 *
 * @module pastoral/dto/life-event-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LifeEventResponseDto {
  // Unique event identifier
  @ApiProperty()
  id!: string;

  // Multi-tenant church scope
  @ApiProperty()
  churchId!: string;

  // Associated member reference
  @ApiProperty()
  memberId!: string;

  // Member name fields for display
  @ApiProperty()
  memberFirstName!: string;

  @ApiProperty()
  memberLastName!: string;

  // Recognized life event type
  @ApiProperty()
  type!: string;

  // ISO date of the event
  @ApiProperty()
  date!: string;

  // Optional structured details
  @ApiPropertyOptional()
  details?: Record<string, unknown>;

  // Whether a greeting notification was sent
  @ApiProperty()
  notified!: boolean;

  // Record creation timestamp
  @ApiProperty()
  createdAt!: string;
}
