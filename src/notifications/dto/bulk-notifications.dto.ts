/**
 * @file bulk-notifications.dto.ts
 * @description Request DTOs for bulk notification actions (mark read / delete).
 *
 * @module notifications/dto/bulk-notifications.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkNotificationsDto {
  @ApiProperty({
    description: 'Notification IDs to act on (max 200)',
    type: [String],
    example: ['55555555-5555-5555-5555-555555555555'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];
}
