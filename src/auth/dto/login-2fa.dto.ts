import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO for completing an email-OTP two-factor sign-in.
 *
 * @module auth/dto/login-2fa.dto
 */
export class Login2faDto {
  @ApiProperty({
    description: 'The account email address',
    example: 'pastor@demo.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: '6-digit code emailed during the login step',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code!: string;
}
