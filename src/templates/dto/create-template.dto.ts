/**
 * @file create-template.dto.ts
 * @description DTO for creating a new message template.
 *
 * @module templates/dto/create-template.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Welcome Message' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Hello {name}, welcome to {church}!' })
  @IsString()
  content!: string;

  @ApiProperty({ enum: ['whatsapp', 'sms', 'email'], example: 'whatsapp' })
  @IsString()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel!: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;
}
