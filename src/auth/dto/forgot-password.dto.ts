import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO for initiating a password reset.
 *
 * @module auth/dto/forgot-password.dto
 */
export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address to send password reset link',
    example: 'pastor@gracecommunity.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
