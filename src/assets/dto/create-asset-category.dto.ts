/**
 * @file create-asset-category.dto.ts
 * @description DTO for creating an asset category.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssetCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Sound Equipment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Microphones, mixers, speakers',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
