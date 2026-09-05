/**
 * @file list-emails.dto.ts
 * @description DTO for listing emails with pagination and status filtering.
 *
 * @module email/dto/list-emails.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * The mailbox view to list. `inbox` = received copies (with trash included via
 * `includeTrashed`), `sent` = copies the user sent.
 */
export enum EmailBox {
  Inbox = 'inbox',
  Sent = 'sent',
}

/**
 * DTO for listing emails query parameters.
 */
export class ListEmailsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 30, example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Mailbox view',
    enum: EmailBox,
    default: EmailBox.Inbox,
    example: EmailBox.Inbox,
  })
  @IsEnum(EmailBox)
  @IsOptional()
  box?: EmailBox;

  @ApiPropertyOptional({
    description: 'Include trashed messages in the result (true = show trash)',
    example: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  includeTrashed?: boolean;
}
