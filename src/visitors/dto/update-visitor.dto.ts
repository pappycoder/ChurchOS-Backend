import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsEnum, MaxLength } from 'class-validator';

export class UpdateVisitorDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'WhatsApp number' })
  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Follow-up status',
    enum: ['new', 'contacted', 'follow_up_scheduled', 'interested', 'converted', 'dropped_off'],
  })
  @IsOptional()
  @IsEnum(['new', 'contacted', 'follow_up_scheduled', 'interested', 'converted', 'dropped_off'])
  follow_up_status?: string;

  @ApiPropertyOptional({ description: 'ID of the follow-up team member assigned' })
  @IsOptional()
  @IsString()
  assigned_to_id?: string;

  @ApiPropertyOptional({ description: 'Notes about the visitor' })
  @IsOptional()
  @IsString()
  notes?: string;
}
