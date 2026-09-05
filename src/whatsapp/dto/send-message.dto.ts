/**
 * @file DTO for sending WhatsApp messages.
 * @module whatsapp/dto/send-message.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Recipient phone number with country code',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({
    description: 'Message type',
    example: 'text',
    enum: ['text', 'image', 'audio', 'video', 'document', 'template'],
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiPropertyOptional({
    description: 'Text body (for type "text")',
    example: 'Hello! Welcome to Grace Community Church.',
  })
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional({ description: 'Media URL (for image/audio/video/document types)' })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Template name (for type "template")' })
  @IsString()
  @IsOptional()
  templateName?: string;

  @ApiPropertyOptional({ description: 'Template parameters as JSON string' })
  @IsString()
  @IsOptional()
  templateParams?: string;
}
