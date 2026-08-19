/**
 * @file verify-mfa.dto.ts
 * @description DTO for verifying a TOTP code during MFA enable/disable.
 *
 * @module profile/dto/verify-mfa.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyMfaDto {
  @ApiProperty({ description: '6-digit TOTP code from authenticator app' })
  @IsString()
  code!: string;
}
