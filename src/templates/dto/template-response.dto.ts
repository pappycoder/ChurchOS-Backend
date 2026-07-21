/**
 * @file template-response.dto.ts
 * @description Response DTO for message template data.
 *
 * @module templates/dto/template-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TemplateResponseDto {
  @ApiProperty()
  templateId!: string;

  @ApiProperty()
  churchId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  channel!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional({ example: ['name', 'church'] })
  variables?: string[];

  @ApiPropertyOptional()
  externalId?: string;

  @ApiPropertyOptional()
  externalStatus?: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
