/**
 * @file update-loan.dto.ts
 * @description DTO for recording an asset loan return.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssetCondition } from '@prisma/client';

export class UpdateLoanDto {
  @ApiPropertyOptional({ description: 'Actual return date', example: '2026-08-10' })
  @IsDateString()
  @IsOptional()
  actualReturnDate?: string;

  @ApiPropertyOptional({ description: 'Condition after return', enum: AssetCondition })
  @IsEnum(AssetCondition)
  @IsOptional()
  conditionAfter?: AssetCondition;

  @ApiPropertyOptional({ description: 'Return notes', example: 'Returned in good condition' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
