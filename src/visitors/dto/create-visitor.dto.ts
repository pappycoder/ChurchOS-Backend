import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class CreateVisitorDto {
  @ApiProperty({ description: 'First name', example: 'Amina' })
  @IsString()
  @MaxLength(100)
  first_name!: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Okafor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 801 234 5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'WhatsApp number' })
  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'amina@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'ID of the follow-up team member assigned',
  })
  @IsOptional()
  @IsString()
  assigned_to_id?: string;

  @ApiPropertyOptional({ description: 'Notes about the visitor' })
  @IsOptional()
  @IsString()
  notes?: string;
}
