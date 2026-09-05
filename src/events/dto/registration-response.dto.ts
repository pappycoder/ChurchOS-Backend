/**
 * @file DTO for event registration response data.
 *
 * Includes payment status, ticket details, and check-in state
 * for both free and paid event registrations.
 *
 * @module events/dto/registration-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrationResponseDto {
  @ApiProperty({ description: 'Registration ID', example: '66666666-6666-6666-6666-666666666666' })
  registrationId!: string;

  @ApiProperty({ description: 'Event ID', example: '55555555-5555-5555-5555-555555555555' })
  eventId!: string;

  @ApiProperty({ description: 'Member ID', example: '44444444-4444-4444-4444-444444444444' })
  memberId!: string;

  @ApiPropertyOptional({
    description: 'Custom registration data',
    example: { dietary_requirements: 'None' },
  })
  customData?: Record<string, unknown>;

  @ApiProperty({
    description: 'Payment status (pending, paid, failed, refunded)',
    example: 'paid',
  })
  paymentStatus!: string;

  @ApiPropertyOptional({
    description: 'Unique ticket code for check-in',
    example: 'EVT-20260721-A1B2C3',
  })
  ticketCode?: string;

  @ApiPropertyOptional({
    description: 'Ticket tier name (e.g. VIP, General)',
    example: 'General',
  })
  tierName?: string;

  @ApiProperty({
    description: 'Number of tickets registered',
    example: 1,
  })
  quantity!: number;

  @ApiProperty({
    description: 'Whether the attendee has checked in',
    example: false,
  })
  checkedIn!: boolean;

  @ApiPropertyOptional({
    description: 'Payment authorization URL (for paid events, pending payment)',
    example: 'https://checkout.paystack.com/abc123',
  })
  authorizationUrl?: string;

  @ApiPropertyOptional({
    description: 'Payment gateway reference',
    example: 'EVT/TIT/abc123',
  })
  paymentReference?: string;

  @ApiProperty({ description: 'Registration date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;
}
