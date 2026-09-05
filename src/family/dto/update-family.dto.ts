/**
 * @file update-family.dto.ts
 * @description DTO for updating an existing family record.
 *
 * All fields are optional — only provided fields are updated.
 *
 * @module family/dto/update-family.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateFamilyDto {
  @ApiPropertyOptional({ example: 'Ogundimu Family' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Head member ID' })
  @IsOptional()
  @IsString()
  headId?: string;
}
