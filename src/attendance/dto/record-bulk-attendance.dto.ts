/**
 * @file record-bulk-attendance.dto.ts
 * @description DTO for recording multiple attendance check-ins at once.
 *
 * @module attendance/dto/record-bulk-attendance.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Individual attendance record within a bulk request.
 */
export class BulkAttendanceRecordDto {
  @ApiPropertyOptional({ description: 'Member ID' })
  @IsString()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Visitor name' })
  @IsString()
  @IsOptional()
  visitorName?: string;
}

/**
 * DTO for recording multiple attendance check-ins for a single service.
 */
export class RecordBulkAttendanceDto {
  @ApiProperty({ description: 'Service ID', example: '11111111-0000-0000-0000-000000000000' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ description: 'Array of attendance records', type: [BulkAttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceRecordDto)
  @IsNotEmpty()
  records!: BulkAttendanceRecordDto[];

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: ['manual', 'qr', 'whatsapp'],
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;
}
