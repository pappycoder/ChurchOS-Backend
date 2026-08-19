/**
 * @file reports-query.dto.ts
 * @description Query DTOs for report generation.
 *
 * @module reports/dto/reports-query.dto
 * @since 1.0.0
 */

import { IsOptional, IsString, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Branch ID to filter by' })
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class ExportReportDto extends ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Export format',
    enum: ['csv', 'pdf'],
    default: 'csv',
  })
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';

  @ApiPropertyOptional({
    description: 'Report type to export',
    enum: ['financial', 'attendance', 'members'],
  })
  @IsString()
  @IsIn(['financial', 'attendance', 'members'])
  type!: string;
}
