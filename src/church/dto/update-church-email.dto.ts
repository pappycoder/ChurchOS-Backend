/**
 * @file DTO for updating the unified church email.
 * @module church/dto/update-church-email.dto
 * @description Changes the church's single email — the acting admin's
 * sign-in credential (Supabase Auth), their profile contact record, and the
 * church's public contact email are kept aligned in one operation.
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class UpdateChurchEmailDto {
  @ApiProperty({
    description: 'New email address (sign-in credential + profile + church contact)',
    example: 'admin@church.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}
