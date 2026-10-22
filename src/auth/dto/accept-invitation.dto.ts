import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'One-time invitation token hash from the email link' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: 'Your chosen password (at least 8 characters)', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword!: string;
}
