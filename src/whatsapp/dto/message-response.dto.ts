/**
 * @file DTO for WhatsApp message response data.
 * @module whatsapp/dto/message-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ description: 'Message ID', example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  messageId!: string;

  @ApiProperty({ description: 'Church ID', example: '11111111-1111-1111-1111-111111111111' })
  churchId!: string;

  @ApiPropertyOptional({ description: 'Member ID if message is from a known member' })
  memberId?: string;

  @ApiProperty({ description: 'Phone number', example: '+2348012345678' })
  phone!: string;

  @ApiProperty({
    description: 'Message direction',
    example: 'inbound',
    enum: ['inbound', 'outbound'],
  })
  direction!: string;

  @ApiProperty({ description: 'Channel', example: 'whatsapp' })
  channel!: string;

  @ApiPropertyOptional({ description: 'Message content' })
  content?: string;

  @ApiPropertyOptional({ description: 'Media URL if message has attachment' })
  mediaUrl?: string;

  @ApiProperty({
    description: 'Delivery status',
    example: 'sent',
    enum: ['sent', 'delivered', 'read', 'failed'],
  })
  status!: string;

  @ApiProperty({ description: 'Creation date', example: '2026-07-20T10:00:00.000Z' })
  createdAt!: string;
}
