/**
 * @file create-loan.dto.ts
 * @description DTO for creating an asset loan record.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AssetCondition } from '@prisma/client';

export class CreateLoanDto {
  @ApiPropertyOptional({
    description: 'Borrower member ID',
    example: '55555555-5555-5555-5555-555555555555',
  })
  @IsUUID()
  @IsOptional()
  borrowerMemberId?: string;

  @ApiPropertyOptional({
    description: 'Borrower name (for non-members)',
    example: 'External Vendor Ltd',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  borrowedByName?: string;

  @ApiProperty({ description: 'Expected return date', example: '2026-08-15' })
  @IsDateString()
  @IsNotEmpty()
  expectedReturnDate!: string;

  @ApiPropertyOptional({ description: 'Condition before loan', enum: AssetCondition })
  @IsEnum(AssetCondition)
  @IsOptional()
  conditionBefore?: AssetCondition;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Borrowed for external event' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
