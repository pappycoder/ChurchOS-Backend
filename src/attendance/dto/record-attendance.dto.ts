/**
 * @file record-attendance.dto.ts
 * @description DTOs for recording attendance check-ins.
 *
 * @module attendance/dto/record-attendance.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for recording a single attendance check-in.
 * Either memberId or visitorName must be provided.
 */
export class RecordAttendanceDto {
  @ApiProperty({ description: 'Service ID', example: '11111111-0000-0000-0000-000000000000' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Member ID (for member check-in)' })
  @IsString()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Visitor name (for visitor check-in)' })
  @IsString()
  @IsOptional()
  visitorName?: string;

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: ['manual', 'qr', 'whatsapp'],
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;
}

/**
 * DTO for recording a walk-in visitor attendance check-in.
 * Requires serviceId and visitorName.
 */
export class RecordVisitorAttendanceDto {
  @ApiProperty({ description: 'Service ID', example: '11111111-0000-0000-0000-000000000000' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ description: 'Visitor name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  visitorName!: string;

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: ['manual', 'qr', 'whatsapp'],
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;
}
