/**
 * @file attendance-response.dto.ts
 * @description Response DTO for attendance records and summaries.
 *
 * @module attendance/dto/attendance-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO representing a single attendance check-in record.
 */
export class AttendanceResponseDto {
  @ApiProperty({ description: 'Attendance record ID' })
  attendanceId!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiPropertyOptional({ description: 'Service ID' })
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Event ID' })
  eventId?: string;

  @ApiPropertyOptional({ description: 'Member ID' })
  memberId?: string;

  @ApiPropertyOptional({ description: 'Linked visitor record ID' })
  visitorId?: string;

  @ApiPropertyOptional({ description: 'Visitor name' })
  visitorName?: string;

  @ApiProperty({ description: 'Check-in category', enum: ['adult', 'children'] })
  category!: string;

  @ApiProperty({ description: 'Check-in time' })
  checkInAt!: string;

  @ApiProperty({ description: 'Check-in source', enum: ['manual', 'qr', 'whatsapp'] })
  source!: string;

  @ApiProperty({ description: 'Created at' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Member name (if member check-in)' })
  memberName?: string;

  @ApiPropertyOptional({ description: 'Service name' })
  serviceName?: string;

  @ApiPropertyOptional({ description: 'Event name' })
  eventName?: string;
}

/**
 * Response DTO for attendance summary statistics.
 */
export class AttendanceSummaryDto {
  @ApiProperty({ description: 'Total check-ins' })
  totalCheckIns!: number;

  @ApiProperty({ description: 'Member check-ins' })
  memberCheckIns!: number;

  @ApiProperty({ description: 'Visitor check-ins' })
  visitorCheckIns!: number;

  @ApiProperty({ description: 'Check-ins by source (manual, qr, whatsapp)' })
  bySource!: Record<string, number>;

  @ApiProperty({
    description: 'Check-ins by category (adult, children)',
    example: { adult: 120, children: 45 },
  })
  byCategory!: Record<string, number>;

  @ApiProperty({
    description: 'Check-ins by gender derived from linked member/visitor records',
    example: { male: 80, female: 70, unknown: 15 },
  })
  byGender!: Record<string, number>;
}

/**
 * Response DTO for attendance trend data point.
 */
export class AttendanceTrendDto {
  @ApiProperty({ description: 'Date or period label' })
  date!: string;

  @ApiProperty({ description: 'Total check-ins for this period' })
  total!: number;

  @ApiProperty({ description: 'Member check-ins' })
  members!: number;

  @ApiProperty({ description: 'Visitor check-ins' })
  visitors!: number;
}
