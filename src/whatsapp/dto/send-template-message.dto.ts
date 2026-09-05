/**
 * @file send-template-message.dto.ts
 * @description DTO for sending a WhatsApp template message.
 *
 * @module whatsapp/dto/send-template-message.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class SendTemplateMessageDto {
  @ApiProperty({ example: '+2348012345678', description: 'Recipient phone number' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({
    example: 'welcome_message',
    description: 'Template name / ID registered with WhatsApp (Termii template ID)',
  })
  @IsString()
  @IsNotEmpty()
  templateName!: string;

  @ApiPropertyOptional({ example: 'en', description: 'Template language code' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    example: { name: 'Ade', church: 'Grace Community Church' },
    description: 'Variables to interpolate into the template',
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @ApiPropertyOptional({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Member ID to associate with the message',
  })
  @IsOptional()
  @IsString()
  memberId?: string;
}
