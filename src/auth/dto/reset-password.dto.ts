import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO for completing a password reset with a recovery token.
 *
 * @module auth/dto/reset-password.dto
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password recovery token from email link',
    example: 'abc123def456...',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters)',
    example: 'NewPassword2026!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  newPassword!: string;
}
