/**
 * @file list-custom-fields.dto.ts
 * @description DTO for listing custom field definitions.
 *
 * @module custom-fields/dto/list-custom-fields.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ListCustomFieldsDto {
  @ApiPropertyOptional({
    description: 'List archived custom fields only (default: active only)',
    default: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
