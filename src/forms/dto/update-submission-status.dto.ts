/**
 * @file update-submission-status.dto.ts
 * @description DTO for approving or rejecting a form submission.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubmissionStatus } from '@prisma/client';

export class UpdateSubmissionStatusDto {
  @ApiProperty({ description: 'New submission status', enum: SubmissionStatus })
  @IsEnum(SubmissionStatus)
  status!: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Reason for rejection (required when rejecting)' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  rejectionReason?: string;
}
