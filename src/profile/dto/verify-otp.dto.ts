/**
 * @file verify-otp.dto.ts
 * @description DTO for verifying an email-OTP code during 2FA enable/disable.
 *
 * @module profile/dto/verify-otp.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: '6-digit code emailed to the profile address' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code!: string;
}
