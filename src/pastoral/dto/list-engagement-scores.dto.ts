/**
 * @file list-engagement-scores.dto.ts
 * @description DTO for listing member engagement scores with pagination and filters.
 *
 * Supports filtering by engagement bucket and member name search, with sorting.
 * All queries are scoped by church_id.
 *
 * @module pastoral/dto/list-engagement-scores.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsIn } from 'class-validator';

export class ListEngagementScoresDto {
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

  // Optional engagement bucket filter (maps to a score range)
  @ApiPropertyOptional({
    description: 'Filter by engagement bucket',
    enum: ['highly_engaged', 'moderately_engaged', 'low_engagement', 'disengaged'],
  })
  @IsOptional()
  @IsEnum(['highly_engaged', 'moderately_engaged', 'low_engagement', 'disengaged'])
  bucket?: 'highly_engaged' | 'moderately_engaged' | 'low_engagement' | 'disengaged';

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
