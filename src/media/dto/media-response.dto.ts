/**
 * @file DTO for media upload responses.
 * @module MediaResponseDto
 * @description Data transfer object returned after successful file uploads.
 * Contains URL, path, dimensions, and size information.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for media upload responses.
 * Contains file URL, storage path, and optional image dimensions.
 */
export class MediaResponseDto {
  @ApiProperty({
    description: 'ID of the created MediaAsset record',
    example: '11111111-1111-1111-1111-111111111111',
  })
  assetId!: string;

  @ApiProperty({
    description: 'Public URL of the uploaded file',
    example: 'https://xxx.supabase.co/storage/v1/object/public/media/churches/abc/logo.webp',
  })
  url!: string;

  @ApiProperty({ description: 'Storage path (bucket-relative)', example: 'churches/abc/logo.webp' })
  path!: string;

  @ApiPropertyOptional({ description: 'Image width in pixels (only for images)', example: 800 })
  width?: number;

  @ApiPropertyOptional({ description: 'Image height in pixels (only for images)', example: 600 })
  height?: number;

  @ApiProperty({ description: 'File size in bytes', example: 45000 })
  size!: number;

  @ApiProperty({ description: 'MIME type', example: 'image/webp' })
  contentType!: string;
}
