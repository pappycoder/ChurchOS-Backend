/**
 * @file DTO for registering a member for an event.
 * @module events/dto/register-for-event.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class RegisterForEventDto {
  @ApiProperty({
    description: 'Member ID to register',
    example: '44444444-4444-4444-4444-444444444444',
  })
  @IsUUID()
  @IsNotEmpty()
  memberId!: string;

  @ApiPropertyOptional({
    description: 'Custom registration field values (JSON)',
    example: { dietary_requirements: 'None' },
  })
  @IsOptional()
  customData?: Record<string, unknown>;
}
