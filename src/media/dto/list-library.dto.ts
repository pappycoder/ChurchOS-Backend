/**
 * @file DTO for listing media assets with filters and pagination.
 * @module media/dto/list-library.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListLibraryDto {
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

  @ApiPropertyOptional({ description: 'Filter by folder path (e.g. profiles, churches)' })
  @IsString()
  @IsOptional()
  folder?: string;

  @ApiPropertyOptional({ description: 'Filter by MIME type (e.g. image/webp, application/pdf)' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Permission filter',
    enum: ['public', 'members', 'leadership'],
  })
  @IsString()
  @IsOptional()
  permissions?: string;

  @ApiPropertyOptional({ description: 'Search by filename' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    default: 'created_at',
    enum: ['created_at', 'filename', 'size_bytes'],
  })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', default: 'desc', enum: ['asc', 'desc'] })
  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
