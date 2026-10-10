import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO for completing authenticator sign-in or legacy factor migration.
 *
 * @module auth/dto/login-2fa.dto
 */
export class Login2faDto {
  @ApiProperty({
    description: 'The account email address',
    example: 'pastor@demo.com',
  })
  @IsOptional()
  @IsEmail()
  @IsNotEmpty()
  email?: string;

  @ApiProperty({ required: false, description: 'Opaque authenticator login challenge' })
  @IsOptional()
  @IsUUID()
  challengeToken?: string;

  @ApiProperty({
    description: 'Current 6-digit authenticator code; legacy email code only during migration',
    example: '123456',
  })
  @IsString()
  @Matches(/^(?:\d{6}|[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{8}){3})$/, {
    message: 'Enter a six-digit authenticator code or a recovery code',
  })
  code!: string;
}
