/**
 * @file DTO for listing transactions.
 * @module giving/dto/list-transactions.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTransactionsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by member ID' })
  @IsUUID()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked service ID' })
  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by linked event ID' })
  @IsUUID()
  @IsOptional()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'success', 'failed', 'reversed'],
  })
  @IsEnum(['pending', 'success', 'failed', 'reversed'] as const)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by type',
    enum: ['digital', 'cash', 'bank_transfer'],
  })
  @IsEnum(['digital', 'cash', 'bank_transfer'] as const)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by payment gateway',
    enum: ['paystack', 'flutterwave', 'manual'],
  })
  @IsEnum(['paystack', 'flutterwave', 'manual'] as const)
  @IsOptional()
  gateway?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)', example: '2026-07-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)', example: '2026-07-31' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    default: 'created_at',
    enum: ['amount', 'created_at'],
  })
  @IsEnum(['amount', 'created_at'] as const)
  @IsOptional()
  sortBy?: 'amount' | 'created_at';

  @ApiPropertyOptional({ description: 'Sort order', default: 'desc', enum: ['asc', 'desc'] })
  @IsEnum(['asc', 'desc'] as const)
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
