/**
 * @file maintenance-response.dto.ts
 * @description Response DTO for asset maintenance records.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceStatus } from '@prisma/client';

export class MaintenanceResponseDto {
  @ApiProperty({ description: 'Maintenance ID' })
  id!: string;

  @ApiProperty({ description: 'Asset ID' })
  assetId!: string;

  @ApiProperty({ description: 'Maintenance type' })
  type!: string;

  @ApiPropertyOptional({ description: 'Maintenance description' })
  description?: string;

  @ApiProperty({ description: 'Maintenance status', enum: MaintenanceStatus })
  status!: MaintenanceStatus;

  @ApiProperty({ description: 'Scheduled maintenance date' })
  scheduledDate!: string;

  @ApiPropertyOptional({ description: 'Completed date' })
  completedDate?: string;

  @ApiPropertyOptional({ description: 'Maintenance cost' })
  cost?: number;

  @ApiPropertyOptional({ description: 'Performed by' })
  performedBy?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
