/**
 * @file create-service.dto.ts
 * @description DTO for creating a new church service.
 *
 * @module attendance/dto/create-service.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Check-in audience categories a service can target. */
export const SERVICE_CATEGORIES = ['adult', 'children'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/**
 * DTO for creating a new church service schedule.
 */
export class CreateServiceDto {
  @ApiProperty({ description: 'Service name', example: 'Sunday Service' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Branch ID (null for church-wide)',
    example: '33333333-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Check-in category this service targets (defaults to adult)',
    enum: SERVICE_CATEGORIES,
    default: 'adult',
  })
  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: ServiceCategory;

  @ApiPropertyOptional({
    description: 'Day of week (0=Sunday, 6=Saturday)',
    example: 0,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @ApiPropertyOptional({
    description: 'Start time (ISO 8601)',
    example: '2026-01-01T09:00:00.000Z',
  })
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time (ISO 8601)', example: '2026-01-01T11:00:00.000Z' })
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Is service active', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
