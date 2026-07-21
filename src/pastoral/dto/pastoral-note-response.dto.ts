/**
 * @file pastoral-note-response.dto.ts
 * @description Response DTO for pastoral note data.
 *
 * Content is returned decrypted (in memory only). The encrypted version
 * is never exposed in API responses.
 *
 * @module pastoral/dto/pastoral-note-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class PastoralNoteResponseDto {
  // Unique note identifier
  @ApiProperty()
  id!: string;

  // Multi-tenant church scope
  @ApiProperty()
  churchId!: string;

  // Associated member reference
  @ApiProperty()
  memberId!: string;

  // Member name fields for display
  @ApiProperty()
  memberFirstName!: string;

  @ApiProperty()
  memberLastName!: string;

  // Author (leader) who created the note
  @ApiProperty()
  authorId!: string;

  @ApiProperty()
  authorFirstName!: string;

  @ApiProperty()
  authorLastName!: string;

  // Decrypted content (never expose encrypted form)
  @ApiProperty({ description: 'Decrypted content of the pastoral note' })
  content!: string;

  // Confidentiality access level
  @ApiProperty({
    enum: ['standard', 'confidential', 'restricted'],
  })
  confidentiality!: string;

  // Categorization tags
  @ApiProperty({ type: [String] })
  tags!: string[];

  // Timestamps for audit trail
  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
