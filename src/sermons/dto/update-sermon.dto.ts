/**
 * @file DTO for updating a sermon.
 * @module sermons/dto/update-sermon.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSermonDto {
  @ApiPropertyOptional({ description: 'Sermon title', example: 'Walking in Faith' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Speaker/pastor name' })
  @IsString()
  @IsOptional()
  speaker?: string;

  @ApiPropertyOptional({ description: 'Sermon date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  sermonDate?: string;

  @ApiPropertyOptional({ description: 'Scripture reference' })
  @IsString()
  @IsOptional()
  scriptureReference?: string;

  @ApiPropertyOptional({ description: 'Series name' })
  @IsString()
  @IsOptional()
  seriesName?: string;

  @ApiPropertyOptional({ description: 'Tags' })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Sermon description or notes' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;
}
