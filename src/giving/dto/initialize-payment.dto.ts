/**
 * @file DTO for initializing a digital payment.
 * @module giving/dto/initialize-payment.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class InitializePaymentDto {
  @ApiProperty({
    description: 'Giving category ID',
    example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Amount in Naira', example: 5000 })
  @IsNumber()
  @Min(100)
  amount!: number;

  @ApiProperty({ description: 'Payer email address', example: 'member@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({
    description: 'Payment gateway to use. If omitted, uses the church default from config.',
    enum: ['paystack', 'flutterwave'],
    example: 'paystack',
  })
  @IsEnum(['paystack', 'flutterwave'] as const)
  @IsOptional()
  gateway?: 'paystack' | 'flutterwave';

  @ApiPropertyOptional({
    description: 'Member ID (if member is registered)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '33333333-3333-3333-3333-333333333333',
  })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Monthly tithe' })
  @IsString()
  @IsOptional()
  notes?: string;
}
