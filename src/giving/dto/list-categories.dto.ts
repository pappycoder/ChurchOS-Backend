/**
 * @file DTO for listing giving categories.
 * @module giving/dto/list-categories.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListCategoriesDto {
  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
