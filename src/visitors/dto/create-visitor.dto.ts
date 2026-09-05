/**
 * @file create-visitor.dto.ts
 * @description DTO for registering a new visitor.
 *
 * @module visitors/dto/create-visitor.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Canonical follow-up pipeline statuses. */
export const FOLLOW_UP_STATUSES = [
  'new',
  'contacted',
  'follow_up_scheduled',
  'interested',
  'converted',
  'dropped_off',
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

/**
 * DTO for registering a new visitor.
 */
export class CreateVisitorDto {
  @ApiProperty({ description: 'First name', example: 'Amina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({ description: 'Last name', example: 'Okafor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Gender (male or female)', example: 'female' })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 801 234 5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'WhatsApp number' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'amina@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Date of first visit (defaults to now)',
    example: '2026-08-24T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  firstVisitDate?: string;

  @ApiPropertyOptional({
    description: 'Initial follow-up status (defaults to new)',
    enum: FOLLOW_UP_STATUSES,
  })
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES)
  followUpStatus?: FollowUpStatus;

  @ApiPropertyOptional({ description: 'ID of the follow-up team member assigned' })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Notes about the visitor' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Additional custom fields as JSON',
    example: { how_heard: 'Friend', prayer_request: 'Job search' },
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
