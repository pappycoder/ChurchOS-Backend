/**
 * @file DTO for event response data.
 * @module events/dto/event-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty({ description: 'Event ID', example: '55555555-5555-5555-5555-555555555555' })
  eventId!: string;

  @ApiProperty({ description: 'Church ID', example: '11111111-1111-1111-1111-111111111111' })
  churchId!: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '33333333-3333-3333-3333-333333333333',
  })
  branchId?: string;

  @ApiProperty({ description: 'Event title', example: 'Sunday Worship Service' })
  title!: string;

  @ApiPropertyOptional({ description: 'Event description' })
  description?: string;

  @ApiProperty({
    description: 'Event type',
    enum: ['service', 'conference', 'lifecycle', 'training', 'social'],
    example: 'service',
  })
  type!: string;

  @ApiProperty({ description: 'Start date and time', example: '2026-08-01T09:00:00.000Z' })
  startDate!: string;

  @ApiPropertyOptional({ description: 'End date and time', example: '2026-08-01T12:00:00.000Z' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Event location', example: 'Main Auditorium' })
  location?: string;

  @ApiPropertyOptional({ description: 'Maximum capacity', example: 200 })
  capacity?: number;

  @ApiProperty({ description: 'Whether the event is free', example: true })
  isFree!: boolean;

  @ApiPropertyOptional({ description: 'Ticket price in Naira', example: 5000 })
  price?: number;

  @ApiProperty({ description: 'Number of registrations', example: 45 })
  registrationCount!: number;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date', example: '2026-07-20T10:00:00.000Z' })
  updatedAt!: string;
}
