/**
 * @file life-event-response.dto.ts
 * @description Response DTO for life event data.
 *
 * @module pastoral/dto/life-event-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LifeEventResponseDto {
  // Step 1: Unique event identifier
  @ApiProperty()
  id!: string;

  // Step 2: Multi-tenant church scope
  @ApiProperty()
  churchId!: string;

  // Step 3: Associated member reference
  @ApiProperty()
  memberId!: string;

  // Step 4: Member name fields for display
  @ApiProperty()
  memberFirstName!: string;

  @ApiProperty()
  memberLastName!: string;

  // Step 5: Recognized life event type
  @ApiProperty()
  type!: string;

  // Step 6: ISO date of the event
  @ApiProperty()
  date!: string;

  // Step 7: Optional structured details
  @ApiPropertyOptional()
  details?: Record<string, any>;

  // Step 8: Whether a greeting notification was sent
  @ApiProperty()
  notified!: boolean;

  // Step 9: Record creation timestamp
  @ApiProperty()
  createdAt!: string;
}
