/**
 * @file DTO for media upload requests.
 * @module UploadMediaDto
 * @description Data transfer object for file upload metadata.
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for file upload requests.
 * Contains optional folder path and entity ID for organizing uploads.
 */
export class UploadMediaDto {
  @ApiPropertyOptional({
    description: 'Storage folder path (e.g., "churches", "branches", "profiles")',
    example: 'churches',
  })
  @IsString()
  @IsOptional()
  folder?: string;

  @ApiPropertyOptional({
    description: 'Record ID to associate with the upload',
    example: '44444444-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsOptional()
  entityId?: string;
}
