/**
 * @file record-attendance.dto.ts
 * @description DTOs for recording attendance check-ins.
 *
 * @module attendance/dto/record-attendance.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SERVICE_CATEGORIES } from './create-service.dto';

const CHECKIN_SOURCES = ['manual', 'qr', 'whatsapp'] as const;

/**
 * DTO for recording a single attendance check-in.
 * Either memberId or visitorName/visitorId must be provided.
 */
export class RecordAttendanceDto {
  @ApiProperty({ description: 'Service ID', example: '11111111-0000-0000-0000-000000000000' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Member ID (for member check-in)' })
  @IsUUID()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Visitor ID (links the check-in to a visitor record)' })
  @IsUUID()
  @IsOptional()
  visitorId?: string;

  @ApiPropertyOptional({ description: 'Visitor name (for walk-in check-ins)' })
  @IsString()
  @IsOptional()
  visitorName?: string;

  @ApiPropertyOptional({
    description: 'Check-in category (defaults to the service category)',
    enum: SERVICE_CATEGORIES,
  })
  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: CHECKIN_SOURCES,
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;
}

/**
 * DTO for recording a walk-in visitor attendance check-in.
 * Requires serviceId and visitorName (or visitorId).
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

  @ApiPropertyOptional({ description: 'Visitor ID (links the check-in to a visitor record)' })
  @IsUUID()
  @IsOptional()
  visitorId?: string;

  @ApiPropertyOptional({
    description: 'Check-in category (defaults to the service category)',
    enum: SERVICE_CATEGORIES,
  })
  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: CHECKIN_SOURCES,
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;
}
