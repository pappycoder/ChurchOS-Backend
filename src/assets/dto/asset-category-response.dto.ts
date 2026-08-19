/**
 * @file asset-category-response.dto.ts
 * @description Response DTO for asset categories.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssetCategoryResponseDto {
  @ApiProperty({ description: 'Category ID', example: '11111111-1111-1111-1111-111111111111' })
  id!: string;

  @ApiProperty({ description: 'Church ID', example: '22222222-2222-2222-2222-222222222222' })
  churchId!: string;

  @ApiProperty({ description: 'Category name', example: 'Sound Equipment' })
  name!: string;

  @ApiPropertyOptional({ description: 'Category description', example: 'Microphones and speakers' })
  description?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
