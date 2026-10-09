/**
 * @file DTO for creating a giving category.
 * @module giving/dto/create-category.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCategoryDto {
  @ApiPropertyOptional({ description: 'Branch that owns this category' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ description: 'Category name', example: 'Tithe' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Regular tithe (10% of income)',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0, example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Whether this category supports recurring giving',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;
}
