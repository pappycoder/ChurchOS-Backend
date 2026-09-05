/**
 * @file email-response.dto.ts
 * @description Response DTOs for the internal email module.
 *
 * @module email/dto/email-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single email as surfaced in a mailbox list or detail read.
 * For an inbox copy the sender/recipient details are resolved; for a sent copy
 * the recipient details are a joined list.
 */
export class EmailItemDto {
  @ApiProperty({
    description: 'Email message ID (UUID)',
    example: '99999999-9999-9999-9999-999999999999',
  })
  id!: string;

  @ApiProperty({ description: 'Email subject', example: 'Quarterly Budget Review' })
  subject!: string;

  @ApiProperty({ description: 'Email body preview for lists', example: 'Hi team, please review…' })
  preview!: string;

  @ApiProperty({
    description: 'Sender Profile ID',
    example: '4f65e21c-fc9e-4942-96de-64b6763d1fd7',
  })
  senderId!: string;

  @ApiPropertyOptional({ description: 'Sender full name', example: 'Pastor John Adebayo' })
  senderName?: string;

  @ApiPropertyOptional({
    description: 'Sender avatar URL',
    example: 'https://storage.example.com/avatars/pastor.jpg',
  })
  senderAvatarUrl?: string;

  @ApiProperty({
    description: 'Recipient Profile ID (inbox copy)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  recipientId!: string;

  @ApiProperty({ description: 'Recipient full name', example: 'Sister Bola Okonkwo' })
  recipientName!: string;

  @ApiPropertyOptional({
    description: 'Read timestamp (null if unread)',
    example: '2026-08-30T10:00:00.000Z',
  })
  readAt?: string;

  @ApiPropertyOptional({
    description: 'Trash timestamp (null if not trashed)',
    example: '2026-08-30T11:00:00.000Z',
  })
  deletedAt?: string;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-08-30T08:00:00.000Z' })
  createdAt!: string;
}

/**
 * Full email detail (read view) with the complete body and participant lists.
 */
export class EmailDetailDto {
  @ApiProperty({
    description: 'Email message ID (UUID)',
    example: '99999999-9999-9999-9999-999999999999',
  })
  id!: string;

  @ApiProperty({ description: 'Email subject', example: 'Quarterly Budget Review' })
  subject!: string;

  @ApiProperty({ description: 'Full email body', example: 'Hi team, please review…' })
  body!: string;

  @ApiProperty({
    description: 'Sender Profile ID',
    example: '4f65e21c-fc9e-4942-96de-64b6763d1fd7',
  })
  senderId!: string;

  @ApiPropertyOptional({ description: 'Sender full name', example: 'Pastor John Adebayo' })
  senderName?: string;

  @ApiPropertyOptional({
    description: 'Sender avatar URL',
    example: 'https://storage.example.com/avatars/pastor.jpg',
  })
  senderAvatarUrl?: string;

  @ApiProperty({
    description: 'Recipient Profile IDs',
    type: [String],
    example: ['22222222-2222-2222-2222-222222222222'],
  })
  recipientIds!: string[];

  @ApiPropertyOptional({
    description: 'Read timestamp for the current user (null if unread)',
    example: '2026-08-30T10:00:00.000Z',
  })
  readAt?: string;

  @ApiPropertyOptional({
    description: 'Trash timestamp for the current user (null if not trashed)',
    example: '2026-08-30T11:00:00.000Z',
  })
  deletedAt?: string;

  @ApiPropertyOptional({
    description: 'Replied-to message ID (threading)',
    example: '88888888-8888-8888-8888-888888888888',
  })
  replyToId?: string;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-08-30T08:00:00.000Z' })
  createdAt!: string;
}

/**
 * A selectable recipient contact.
 */
export class EmailContactDto {
  @ApiProperty({
    description: 'Profile ID (UUID)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  id!: string;

  @ApiProperty({ description: 'Full name', example: 'Pastor John Adebayo' })
  name!: string;

  @ApiProperty({ description: 'Primary role', example: 'branch_pastor' })
  role!: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'pastor@church.org' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '11111111-1111-1111-1111-111111111111',
  })
  branchId?: string;

  @ApiPropertyOptional({ description: 'Branch name', example: 'Main Campus' })
  branchName?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://supabase.co/storage/v1/object/public/media/avatar.webp',
  })
  avatarUrl?: string;
}

/**
 * Manages list of unread counts alongside an email list.
 */
export class EmailListEnvelopeDto {
  @ApiProperty({ type: [EmailItemDto] })
  data!: EmailItemDto[];

  @ApiProperty({ description: 'Total messages in the current view', example: 25 })
  total!: number;

  @ApiProperty({ description: 'Unread count for the inbox box', example: 6 })
  unreadCount!: number;
}
