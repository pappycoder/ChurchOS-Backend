/**
 * @file DTO for creating a sermon.
 * @module sermons/dto/create-sermon.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateSermonDto {
  @ApiProperty({ description: 'Sermon title', example: 'Walking in Faith' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Speaker/pastor name', example: 'Pastor John Doe' })
  @IsString()
  @IsOptional()
  speaker?: string;

  @ApiProperty({ description: 'Sermon date (ISO 8601)', example: '2026-07-20T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  sermonDate!: string;

  @ApiPropertyOptional({ description: 'Scripture reference', example: 'Hebrews 11:1-6' })
  @IsString()
  @IsOptional()
  scriptureReference?: string;

  @ApiPropertyOptional({ description: 'Series name', example: 'Faith Foundations' })
  @IsString()
  @IsOptional()
  seriesName?: string;

  @ApiPropertyOptional({ description: 'Tags', example: ['faith', 'trust', 'growing'] })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Sermon description or notes' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Audio file URL (uploaded or external)' })
  @IsString()
  @IsOptional()
  audioUrl?: string;

  @ApiPropertyOptional({ description: 'Video file URL (uploaded or external)' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds', example: 2400 })
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;
}
