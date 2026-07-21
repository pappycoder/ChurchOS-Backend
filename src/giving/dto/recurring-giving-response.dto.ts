/**
 * @file DTO for recurring giving responses.
 * @module giving/dto/recurring-giving-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecurringGivingResponseDto {
  @ApiProperty({ description: 'Recurring giving ID' })
  id!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiProperty({ description: 'Member ID' })
  memberId!: string;

  @ApiProperty({ description: 'Category ID' })
  categoryId!: string;

  @ApiProperty({ description: 'Category name', example: 'Tithe' })
  categoryName!: string;

  @ApiProperty({ description: 'Amount in Naira', example: 5000 })
  amount!: number;

  @ApiProperty({ description: 'Currency', example: 'NGN' })
  currency!: string;

  @ApiProperty({
    description: 'Charge frequency',
    enum: ['weekly', 'monthly', 'quarterly'],
  })
  frequency!: string;

  @ApiProperty({ description: 'Whether recurring giving is active' })
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Next scheduled charge date' })
  nextChargeDate?: string;

  @ApiPropertyOptional({ description: 'Last successful charge date' })
  lastChargeDate?: string;

  @ApiProperty({ description: 'Consecutive failed charge attempts' })
  failedAttemptCount!: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date' })
  updatedAt!: string;
}
