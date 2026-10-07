/**
 * @file Media folder summary DTO.
 * @module media/dto/media-folder-summary.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class MediaFolderSummaryDto {
  @ApiProperty({ description: 'Storage folder name', example: 'sermons' })
  folder!: string;

  @ApiProperty({ description: 'Number of media assets in this folder', example: 42 })
  count!: number;

  @ApiProperty({
    description: 'Timestamp of the newest asset in this folder',
    example: '2026-10-06T09:24:00.000Z',
    nullable: true,
  })
  newestAt!: string | null;
}
