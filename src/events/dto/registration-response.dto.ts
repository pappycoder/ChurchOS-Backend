/**
 * @file DTO for event registration response data.
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

  @ApiProperty({ description: 'Registration date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;
}
