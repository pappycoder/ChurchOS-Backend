/**
 * @file DTO for updating church configuration.
 * @module UpdateChurchConfigDto
 * @description Data transfer object for upserting church config key-value pairs.
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

/**
 * DTO for updating church configuration.
 * Supports flexible key-value pairs that will be upserted.
 */
export class UpdateChurchConfigDto {
  @ApiPropertyOptional({
    description: 'Configuration key-value pairs to upsert',
    example: {
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      attendance_enabled: true,
    },
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
