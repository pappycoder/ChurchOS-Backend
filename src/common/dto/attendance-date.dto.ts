import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

export class AttendanceDateDto {
  @ApiPropertyOptional({
    description: 'Attendance day (YYYY-MM-DD); defaults to today when omitted',
    example: '2026-10-18',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  attendanceDate?: string;
}
