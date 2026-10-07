/**
 * @file DTO for giving transaction summary responses.
 * @module giving/dto/transaction-summary-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class GivingTrendPointDto {
  @ApiProperty({ description: 'Day (yyyy-MM-dd)', example: '2026-07-20' })
  date!: string;

  @ApiProperty({ description: 'Total successful giving for the day', example: 25000 })
  total!: number;
}

export class TransactionSummaryResponseDto {
  @ApiProperty({ description: 'Total successful giving this calendar month', example: 150000 })
  monthTotal!: number;

  @ApiProperty({ description: 'Total successful giving all time', example: 2000000 })
  allTimeTotal!: number;

  @ApiProperty({ description: 'Total number of successful transactions', example: 420 })
  count!: number;

  @ApiProperty({ description: 'Daily totals for the last 30 days', type: [GivingTrendPointDto] })
  trend!: GivingTrendPointDto[];
}
