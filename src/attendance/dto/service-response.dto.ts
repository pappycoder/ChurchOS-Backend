/**
 * @file service-response.dto.ts
 * @description Response DTO for church service data.
 *
 * @module attendance/dto/service-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO representing a church service schedule.
 */
export class ServiceResponseDto {
  @ApiProperty({ description: 'Service ID' })
  serviceId!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  branchId?: string;

  @ApiProperty({ description: 'Service name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Day of week (0=Sunday, 6=Saturday)' })
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Start time' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time' })
  endTime?: string;

  @ApiProperty({ description: 'Is service active' })
  isActive!: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt!: string;

  @ApiProperty({ description: 'Updated at' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: 'Attendance count for today' })
  attendanceCount?: number;
}
