/**
 * @file verify-otp.dto.ts
 * @description DTO for verifying an authenticator code during 2FA enable/disable.
 *
 * @module profile/dto/verify-otp.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: '6-digit authenticator app code' })
  @IsString()
  @Matches(/^(?:\d{6}|[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{8}){3})$/, {
    message: 'Enter a six-digit authenticator code or a recovery code',
  })
  code!: string;

  @ApiProperty()
  @IsUUID()
  factorId!: string;
}
