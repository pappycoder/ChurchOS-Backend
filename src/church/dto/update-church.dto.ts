/**
 * @file DTO for updating church details.
 * @module UpdateChurchDto
 * @description Data transfer object for partial church updates.
 * All fields are optional to support partial updates.
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * DTO for updating church details.
 * All fields are optional to support partial updates.
 */
export class UpdateChurchDto {
  @ApiPropertyOptional({ description: 'Church name', example: 'Redeemed Christian Church of God' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Denomination', example: 'Pentecostal' })
  @IsString()
  @IsOptional()
  denomination?: string;

  @ApiPropertyOptional({ description: 'Street address', example: '123 Faith Avenue' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Lagos' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'State', example: 'Lagos' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'Nigeria' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 801 234 5678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'info@church.org' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Website URL', example: 'https://www.church.org' })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({
    description: 'Logo image URL',
    example: 'https://storage.supabase.co/v1/object/public/media/churches/abc/logo.webp',
  })
  @IsString()
  @IsOptional()
  logoUrl?: string;
}
