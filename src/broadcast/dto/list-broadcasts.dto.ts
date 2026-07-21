/**
 * @file list-broadcasts.dto.ts
 * @description DTO for listing broadcasts with pagination and filters.
 *
 * @module broadcast/dto/list-broadcasts.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class ListBroadcastsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'] })
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['whatsapp', 'sms', 'email'] })
  @IsOptional()
  @IsString()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: string;
}
