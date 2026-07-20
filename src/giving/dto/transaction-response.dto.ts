/**
 * @file DTO for transaction responses.
 * @module giving/dto/transaction-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionResponseDto {
  @ApiProperty({ description: 'Transaction ID', example: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' })
  transactionId!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  branchId?: string;

  @ApiPropertyOptional({ description: 'Member ID' })
  memberId?: string;

  @ApiProperty({ description: 'Category ID' })
  categoryId!: string;

  @ApiProperty({ description: 'Category name', example: 'Tithe' })
  categoryName!: string;

  @ApiProperty({ description: 'Amount', example: 5000 })
  amount!: number;

  @ApiProperty({ description: 'Currency', example: 'NGN' })
  currency!: string;

  @ApiProperty({ description: 'Transaction type', enum: ['digital', 'cash', 'bank_transfer'] })
  type!: string;

  @ApiProperty({
    description: 'Transaction status',
    enum: ['pending', 'success', 'failed', 'reversed'],
  })
  status!: string;

  @ApiPropertyOptional({ description: 'Payment reference', example: 'TITHSEED17000000001' })
  paymentReference?: string;

  @ApiProperty({
    description: 'Payment gateway used',
    enum: ['paystack', 'flutterwave', 'manual'],
    example: 'paystack',
  })
  paymentGateway!: string;

  @ApiPropertyOptional({ description: 'Payment method/channel', example: 'card' })
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Receipt number', example: 'GCC/TIT/2026/0001' })
  receiptNumber?: string;

  @ApiPropertyOptional({ description: 'Receipt URL' })
  receiptUrl?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date', example: '2026-07-20T10:00:00.000Z' })
  updatedAt!: string;
}
