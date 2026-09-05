/**
 * @file DTO for updating user profile.
 * @module profile/dto/update-profile.dto
 * @description Data transfer object for partial profile updates (name, phone).
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for updating user profile details.
 * All fields are optional — only provided fields are updated.
 * Note: email is intentionally excluded — it is managed by church admins
 * via PATCH /church/email (sign-in credential, profile and church stay aligned).
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
    description: 'Phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
