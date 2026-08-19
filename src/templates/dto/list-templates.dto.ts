/**
 * @file list-templates.dto.ts
 * @description DTO for listing message templates with pagination and filters.
 *
 * Supports filtering by channel (whatsapp, sms, email) and status (draft, published, archived).
 *
 * @module templates/dto/list-templates.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class ListTemplatesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['whatsapp', 'sms', 'email'] })
  @IsOptional()
  @IsString()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: string;

  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'published', 'archived'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
