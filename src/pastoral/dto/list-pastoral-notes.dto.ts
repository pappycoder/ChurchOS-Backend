/**
 * @file list-pastoral-notes.dto.ts
 * @description DTO for listing pastoral notes with pagination and filters.
 *
 * Supports filtering by member ID, author ID, confidentiality level,
 * and tags. All queries are scoped by church_id.
 *
 * @module pastoral/dto/list-pastoral-notes.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsArray } from 'class-validator';

export class ListPastoralNotesDto {
  // Step 1: Default page number starting at 1
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  // Step 2: Page size capped between 1 and 100
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // Step 3: Optional member ID filter
  @ApiPropertyOptional({ description: 'Filter by member ID' })
  @IsOptional()
  @IsString()
  memberId?: string;

  // Step 4: Optional author ID filter
  @ApiPropertyOptional({ description: 'Filter by author ID' })
  @IsOptional()
  @IsString()
  authorId?: string;

  // Step 5: Optional confidentiality level filter
  @ApiPropertyOptional({
    description: 'Filter by confidentiality level',
    enum: ['standard', 'confidential', 'restricted'],
  })
  @IsOptional()
  @IsEnum(['standard', 'confidential', 'restricted'])
  confidentiality?: 'standard' | 'confidential' | 'restricted';

  // Step 6: Optional tags filter (AND logic — all specified tags must be present)
  @ApiPropertyOptional({
    description: 'Filter by tags (notes must contain ALL specified tags)',
    example: ['prayer', 'counseling'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // Step 7: Sort field defaults to created_at
  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['created_at', 'updated_at'],
    default: 'created_at',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  // Step 8: Sort direction defaults to descending
  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
