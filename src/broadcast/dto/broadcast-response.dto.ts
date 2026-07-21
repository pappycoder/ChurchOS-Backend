/**
 * @file broadcast-response.dto.ts
 * @description Response DTO for broadcast data.
 *
 * @module broadcast/dto/broadcast-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BroadcastResponseDto {
  @ApiProperty()
  broadcastId!: string;

  @ApiProperty()
  churchId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  templateId!: string;

  @ApiProperty()
  templateName!: string;

  @ApiProperty({ enum: ['whatsapp', 'sms', 'email'] })
  channel!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  scheduledAt?: string;

  @ApiPropertyOptional()
  sentAt?: string;

  @ApiProperty()
  totalRecipients!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
