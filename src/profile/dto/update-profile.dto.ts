/**
 * @file DTO for updating user profile.
 * @module profile/dto/update-profile.dto
 * @description Data transfer object for partial profile updates (name, phone).
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * DTO for updating user profile details.
 * All fields are optional — only provided fields are updated.
 * Email changes are synced to Supabase Auth so credentials stay consistent.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'First name',
    example: 'Adebayo',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Ogundimu',
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Email address (synced to Supabase Auth)',
    example: 'adebayo@church.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
