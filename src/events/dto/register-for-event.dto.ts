/**
 * @file DTO for registering a member for an event.
 *
 * Supports both free and paid events. For paid events, include tierId
 * and quantity to select a specific pricing tier.
 *
 * @module events/dto/register-for-event.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Ticket tier ID (for paid events with multiple tiers)',
    example: '77777777-7777-7777-7777-777777777777',
  })
  @IsUUID()
  @IsOptional()
  tierId?: string;

  @ApiPropertyOptional({
    description: 'Number of tickets to register (default: 1)',
    example: 1,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;
}
