/**
 * @file list-asset-categories.dto.ts
 * @description Query DTO for listing asset categories.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAssetCategoriesDto {
  @ApiPropertyOptional({
    description: 'List archived records only (default: active only)',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
