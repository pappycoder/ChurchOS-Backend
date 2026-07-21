/**
 * @file DTO for creating a ticket tier.
 *
 * Defines pricing tiers for paid events (e.g. VIP, General, Student).
 *
 * @module events/dto/create-ticket-tier.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTicketTierDto {
  @ApiProperty({
    description: 'Tier name (e.g. VIP, General, Student)',
    example: 'VIP',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Price in Naira',
    example: 5000,
  })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    description: 'Per-tier capacity limit (optional, falls back to event capacity)',
    example: 50,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Tier description',
    example: 'Front-row seating with complimentary refreshments',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
