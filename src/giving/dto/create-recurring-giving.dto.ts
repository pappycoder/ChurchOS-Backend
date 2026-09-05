/**
 * @file DTO for creating a recurring giving schedule.
 * @module giving/dto/create-recurring-giving.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRecurringGivingDto {
  @ApiProperty({
    description: 'Giving category ID (must have is_recurring enabled)',
    example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Amount in Naira', example: 5000 })
  @IsNumber()
  @Min(100)
  amount!: number;

  @ApiProperty({
    description: 'Charge frequency',
    enum: ['weekly', 'monthly', 'quarterly'],
    example: 'monthly',
  })
  @IsEnum(['weekly', 'monthly', 'quarterly'] as const)
  @IsNotEmpty()
  frequency!: 'weekly' | 'monthly' | 'quarterly';

  @ApiProperty({ description: 'Payer email address', example: 'member@example.com' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({
    description: 'Member ID (if member is registered)',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({
    description: 'Payment gateway to use',
    enum: ['paystack', 'flutterwave'],
    example: 'paystack',
  })
  @IsEnum(['paystack', 'flutterwave'] as const)
  @IsOptional()
  gateway?: 'paystack' | 'flutterwave';
}
