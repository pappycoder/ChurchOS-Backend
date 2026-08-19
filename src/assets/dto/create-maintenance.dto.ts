/**
 * @file create-maintenance.dto.ts
 * @description DTO for creating an asset maintenance record.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MaintenanceStatus } from '@prisma/client';

export class CreateMaintenanceDto {
  @ApiProperty({ description: 'Maintenance type', example: 'Routine service' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type!: string;

  @ApiPropertyOptional({
    description: 'Maintenance description',
    example: 'Cleaned filters and checked wiring',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Maintenance status',
    enum: MaintenanceStatus,
    default: MaintenanceStatus.scheduled,
  })
  @IsEnum(MaintenanceStatus)
  @IsOptional()
  status?: MaintenanceStatus;

  @ApiProperty({ description: 'Scheduled maintenance date', example: '2026-08-01' })
  @IsDateString()
  scheduledDate!: string;

  @ApiPropertyOptional({ description: 'Completed date', example: '2026-08-02' })
  @IsDateString()
  @IsOptional()
  completedDate?: string;

  @ApiPropertyOptional({ description: 'Maintenance cost', example: 15000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ description: 'Performed by', example: 'John Doe' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  performedBy?: string;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Parts ordered' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
