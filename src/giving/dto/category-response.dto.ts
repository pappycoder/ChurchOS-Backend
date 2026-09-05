/**
 * @file DTO for giving category responses.
 * @module giving/dto/category-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ description: 'Category ID', example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  categoryId!: string;

  @ApiProperty({ description: 'Church ID', example: '00000000-0000-0000-0000-000000000001' })
  churchId!: string;

  @ApiProperty({ description: 'Category name', example: 'Tithe' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Regular tithe (10% of income)',
  })
  description?: string;

  @ApiProperty({ description: 'Display order', example: 1 })
  displayOrder!: number;

  @ApiProperty({ description: 'Supports recurring giving', example: false })
  isRecurring!: boolean;

  @ApiProperty({ description: 'Category is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date', example: '2026-07-20T10:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: 'Set when the record is archived' })
  archivedAt?: string;
}
