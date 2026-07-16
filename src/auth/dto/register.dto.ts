/**
 * @file register.dto.ts
 * @description DTO for user registration endpoint.
 *
 * Validates all required fields for creating a new church admin account.
 * Includes email/password for Supabase Auth, personal details, and church name.
 *
 * @module auth/dto/register
 * @since 1.0.0
 */

import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Admin email address',
    example: 'pastor@gracecommunity.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Password (minimum 8 characters)',
    example: 'SecureP@ss123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsNotEmpty()
  password!: string;

  @ApiProperty({
    description: 'Admin first name',
    example: 'Adebayo',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'Admin last name',
    example: 'Ogundimu',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Phone number (Nigerian format)',
    example: '+234 803 456 7890',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'Church name',
    example: 'Grace Community Church',
  })
  @IsString()
  @IsNotEmpty()
  churchName!: string;

  @ApiPropertyOptional({
    description: 'Church denomination',
    example: 'Pentecostal',
  })
  @IsString()
  @IsOptional()
  denomination?: string;
}
