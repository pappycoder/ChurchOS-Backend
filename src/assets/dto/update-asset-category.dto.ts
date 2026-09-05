/**
 * @file update-asset-category.dto.ts
 * @description DTO for updating an asset category.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAssetCategoryDto {
  @ApiPropertyOptional({ description: 'Category name', example: 'Audio Equipment' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Category description', example: 'Updated description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
