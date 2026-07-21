/**
 * @file DTO for ticket validation response.
 *
 * Returned when a ticket code is scanned at event check-in.
 *
 * @module events/dto/ticket-validation-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TicketValidationResponseDto {
  @ApiProperty({
    description: 'Whether the ticket is valid for check-in',
    example: true,
  })
  valid!: boolean;

  @ApiPropertyOptional({
    description: 'Attendee full name (if ticket is linked to a member)',
    example: 'John Doe',
  })
  memberName?: string;

  @ApiPropertyOptional({
    description: 'Event name',
    example: 'Sunday Service',
  })
  eventName?: string;

  @ApiPropertyOptional({
    description: 'Ticket tier name',
    example: 'VIP',
  })
  tierName?: string;

  @ApiPropertyOptional({
    description: 'Check-in timestamp (if already checked in)',
    example: '2026-07-21T09:00:00.000Z',
  })
  checkedInAt?: string;
}
