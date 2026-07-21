/**
 * @file list-forms.dto.ts
 * @description DTO for listing and filtering forms.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FormStatus } from '@prisma/client';

export class ListFormsDto {
  @ApiPropertyOptional({ description: 'Filter by form status', enum: FormStatus })
  @IsEnum(FormStatus)
  @IsOptional()
  status?: FormStatus;

  @ApiPropertyOptional({ description: 'Filter by template flag' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Search by title or description' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}
