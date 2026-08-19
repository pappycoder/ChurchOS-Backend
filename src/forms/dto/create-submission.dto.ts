/**
 * @file create-submission.dto.ts
 * @description DTO for submitting a form.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateFormSubmissionDto {
  @ApiProperty({ description: 'Submitted field data keyed by field key' })
  @IsObject()
  data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Uploaded media asset IDs to attach to the submission',
    example: ['11111111-1111-1111-1111-111111111111'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attachmentAssetIds?: string[];
}
