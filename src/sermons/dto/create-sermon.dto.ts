/**
 * @file DTO for creating a sermon.
 * @module sermons/dto/create-sermon.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsUrl,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSermonDto {
  @ApiPropertyOptional({ description: 'Branch that owns this sermon' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  audioUrl?: string | null;

  @ApiPropertyOptional({ description: 'Video file URL (uploaded or external)' })
  @IsString()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  videoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Duration in seconds', example: 2400 })
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;
}
