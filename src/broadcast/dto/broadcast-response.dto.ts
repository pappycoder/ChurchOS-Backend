/**
 * @file broadcast-response.dto.ts
 * @description Response DTO for broadcast data.
 *
 * @module broadcast/dto/broadcast-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BroadcastResponseDto {
  @ApiProperty({ description: 'Unique identifier of the broadcast' })
  broadcastId!: string;

  @ApiProperty({ description: 'ID of the church that owns the broadcast' })
  churchId!: string;

  @ApiProperty({ description: 'Name of the broadcast campaign' })
  name!: string;

  @ApiProperty({ description: 'ID of the message template used for the broadcast' })
  templateId!: string;

  @ApiProperty({ description: 'Display name of the message template' })
  templateName!: string;

  @ApiProperty({ enum: ['whatsapp', 'sms', 'email'] })
  channel!: string;

  @ApiProperty({
    description: 'Current status of the broadcast (e.g. draft, queued, sent, failed)',
  })
  status!: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp when the broadcast is scheduled to be sent',
  })
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 timestamp when the broadcast was actually sent' })
  sentAt?: string;

  @ApiProperty({ description: 'Total number of recipients targeted by the broadcast' })
  totalRecipients!: number;

  @ApiProperty({ description: 'ISO 8601 timestamp when the broadcast was created' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp when the broadcast was last updated' })
  updatedAt!: string;
}
