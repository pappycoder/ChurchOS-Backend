/**
 * @file mfa-secret-response.dto.ts
 * @description Response DTO for MFA secret generation.
 *
 * Contains the base32-encoded TOTP secret and the otpauth:// URI
 * for QR code scanning in authenticator apps.
 *
 * @module profile/dto/mfa-secret-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class MfaSecretResponseDto {
  @ApiProperty({ description: 'TOTP secret key (base32 encoded)' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for QR code generation' })
  otpauthUrl!: string;
}
