/**
 * @file DTO for listing events with filters and pagination.
 * @module events/dto/list-events.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListEventsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Filter by event type',
    enum: ['service', 'conference', 'lifecycle', 'training', 'social'],
  })
  @IsEnum(['service', 'conference', 'lifecycle', 'training', 'social'] as const)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by upcoming/past/all',
    enum: ['upcoming', 'past', 'all'],
    default: 'upcoming',
  })
  @IsEnum(['upcoming', 'past', 'all'] as const)
  @IsOptional()
  dateFilter?: string;

  @ApiPropertyOptional({ description: 'Start date range (ISO string)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date range (ISO string)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Search by title or description' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    default: 'start_date',
    enum: ['start_date', 'created_at', 'title'],
  })
  @IsEnum(['start_date', 'created_at', 'title'] as const)
  @IsOptional()
  sortBy?: 'start_date' | 'created_at' | 'title';

  @ApiPropertyOptional({ description: 'Sort order', default: 'asc', enum: ['asc', 'desc'] })
  @IsEnum(['asc', 'desc'] as const)
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
