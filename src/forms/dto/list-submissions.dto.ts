/**
 * @file list-submissions.dto.ts
 * @description DTO for listing and filtering form submissions.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';

export class ListFormSubmissionsDto {
  @ApiPropertyOptional({ description: 'Filter by submission status', enum: SubmissionStatus })
  @IsEnum(SubmissionStatus)
  @IsOptional()
  status?: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Filter by submitter user ID' })
  @IsUUID()
  @IsOptional()
  submittedBy?: string;

  @ApiPropertyOptional({ description: 'Search submitted data values (simple text match)' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}
