/**
 * @file DTO for inbound WhatsApp webhook payload.
 * @module whatsapp/dto/webhook.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WebhookContactDto {
  @ApiProperty({
    description: 'WhatsApp ID (phone number with country code)',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  wa_id!: string;

  @ApiPropertyOptional({ description: 'Profile name' })
  @IsString()
  @IsOptional()
  profile?: { name: string };
}

export class WebhookTextDto {
  @ApiProperty({ description: 'Message body', example: 'CHECKIN' })
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class WebhookMessageDto {
  @ApiProperty({ description: 'Message ID from WhatsApp', example: 'false_1234567890_1234ABCDEF' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ description: 'Message timestamp (Unix seconds)', example: '1700000000' })
  @IsString()
  @IsNotEmpty()
  timestamp!: string;

  @ApiProperty({ description: 'Sender phone number', example: '+2348012345678' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiPropertyOptional({ description: 'Text content for text messages' })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookTextDto)
  text?: WebhookTextDto;

  @ApiPropertyOptional({
    description: 'Message type',
    example: 'text',
    enum: ['text', 'image', 'audio', 'video', 'document', 'location', 'contacts'],
  })
  @IsString()
  @IsOptional()
  type?: string;
}

export class WebhookDto {
  @ApiProperty({ description: 'Array of contacts in the message' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookContactDto)
  contacts!: WebhookContactDto[];

  @ApiProperty({ description: 'Array of messages' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookMessageDto)
  messages!: WebhookMessageDto[];
}

export class WebhookStatusDto {
  @ApiProperty({ description: 'Status update' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ description: 'New status', enum: ['sent', 'delivered', 'read', 'failed'] })
  @IsString()
  @IsNotEmpty()
  status!: 'sent' | 'delivered' | 'read' | 'failed';

  @ApiPropertyOptional({ description: 'Timestamp' })
  @IsString()
  @IsOptional()
  timestamp?: string;
}

export class WebhookBodyDto {
  @ApiPropertyOptional({ description: 'Messaging product', example: 'whatsapp' })
  @IsString()
  @IsOptional()
  messaging_product?: string;

  @ApiPropertyOptional({ description: 'Contacts array' })
  @IsArray()
  @IsOptional()
  contacts?: WebhookContactDto[];

  @ApiPropertyOptional({ description: 'Messages array' })
  @IsArray()
  @IsOptional()
  messages?: WebhookMessageDto[];

  @ApiPropertyOptional({ description: 'Status array' })
  @IsArray()
  @IsOptional()
  statuses?: WebhookStatusDto[];
}
