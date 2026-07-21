/**
 * @file template-response.dto.ts
 * @description Response DTO for message template data.
 *
 * @module templates/dto/template-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
