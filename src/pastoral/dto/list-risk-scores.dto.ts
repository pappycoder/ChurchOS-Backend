/**
 * @file list-risk-scores.dto.ts
 * @description DTO for listing member risk scores with pagination and filters.
 *
 * Supports filtering by risk level and member name search, with sorting.
 * All queries are scoped by church_id.
 *
 * @module pastoral/dto/list-risk-scores.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsIn } from 'class-validator';

export class ListRiskScoresDto {
  // Default page number starting at 1
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  // Page size capped between 1 and 100
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Optional member name search
  @ApiPropertyOptional({ description: 'Search by member first/last name' })
  @IsOptional()
  @IsString()
  search?: string;

  // Optional risk level filter
  @ApiPropertyOptional({
    description: 'Filter by risk level',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  level?: 'low' | 'medium' | 'high' | 'critical';

  // Sort field defaults to score
  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['score', 'calculated_at'],
    default: 'score',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  // Sort direction defaults to descending
  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
