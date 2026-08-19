/**
 * @file DTO for sermon response data.
 * @module sermons/dto/sermon-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SermonResponseDto {
  @ApiProperty({ description: 'Sermon ID', example: '77777777-7777-7777-7777-777777777777' })
  sermonId!: string;

  @ApiProperty({ description: 'Church ID', example: '11111111-1111-1111-1111-111111111111' })
  churchId!: string;

  @ApiProperty({ description: 'Sermon title', example: 'Walking in Faith' })
  title!: string;

  @ApiPropertyOptional({ description: 'Speaker name', example: 'Pastor John Doe' })
  speaker?: string;

  @ApiProperty({ description: 'Sermon date', example: '2026-07-20T09:00:00.000Z' })
  sermonDate!: string;

  @ApiPropertyOptional({ description: 'Scripture reference', example: 'Hebrews 11:1-6' })
  scriptureReference?: string;

  @ApiPropertyOptional({ description: 'Series name', example: 'Faith Foundations' })
  seriesName?: string;

  @ApiProperty({ description: 'Tags', example: ['faith', 'trust'] })
  tags!: string[];

  @ApiPropertyOptional({ description: 'Audio file URL' })
  audioUrl?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds', example: 2400 })
  durationSeconds?: number;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date', example: '2026-07-20T10:00:00.000Z' })
  updatedAt!: string;
}
