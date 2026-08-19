/**
 * @file create-broadcast.dto.ts
 * @description DTO for creating a new broadcast.
 *
 * @module broadcast/dto/create-broadcast.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  IsUUID,
  IsISO8601,
} from 'class-validator';

export class CreateBroadcastDto {
  @ApiProperty({ example: 'Sunday Service Reminder' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({ enum: ['whatsapp', 'sms', 'email'], example: 'whatsapp' })
  @IsString()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel!: 'whatsapp' | 'sms' | 'email';

  @ApiPropertyOptional({
    description: 'Audience filter for selecting recipients',
    example: {
      status: 'active',
      branchId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      gender: 'male',
    },
  })
  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Schedule broadcast for later (ISO 8601). Omit to send immediately.',
    example: '2026-08-01T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
