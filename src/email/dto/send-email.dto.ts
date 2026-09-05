/**
 * @file send-email.dto.ts
 * @description DTO for sending an internal in-app email.
 *
 * @module email/dto/send-email.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for sending an internal in-app email to one or more recipients.
 */
export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient Profile IDs (main roles only, same church, not self)',
    example: ['22222222-2222-2222-2222-222222222222'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  recipientIds!: string[];

  @ApiProperty({
    description: 'Email subject',
    example: 'Quarterly Budget Review',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({
    description: 'Email body (plain text or lightweight markup)',
    example: 'Hi team, please review the attached figures before Thursday.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @ApiPropertyOptional({
    description: 'ID of the message being replied to (for threading)',
    example: '99999999-9999-9999-9999-999999999999',
  })
  @IsUUID('4')
  @IsOptional()
  replyToId?: string;
}
