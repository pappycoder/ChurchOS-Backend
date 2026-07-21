/**
 * @file DTO for media asset response data.
 * @module media/dto/media-asset-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class MediaAssetResponseDto {
  @ApiProperty({ description: 'Media asset ID', example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  assetId!: string;

  @ApiProperty({ description: 'Church ID', example: '11111111-1111-1111-1111-111111111111' })
  churchId!: string;

  @ApiProperty({ description: 'Original filename', example: 'sermon-2026-07-20.webp' })
  filename!: string;

  @ApiProperty({ description: 'Public URL of the file' })
  url!: string;

  @ApiProperty({ description: 'MIME type', example: 'image/webp' })
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes', example: 45000 })
  sizeBytes!: number;

  @ApiProperty({ description: 'Storage folder', example: 'profiles' })
  folder!: string;

  @ApiProperty({
    description: 'Access permissions',
    example: 'members',
    enum: ['public', 'members', 'leadership'],
  })
  permissions!: string;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;
}
