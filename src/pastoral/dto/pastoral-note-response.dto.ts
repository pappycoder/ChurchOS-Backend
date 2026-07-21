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
  // Step 1: Unique note identifier
  @ApiProperty()
  id!: string;

  // Step 2: Multi-tenant church scope
  @ApiProperty()
  churchId!: string;

  // Step 3: Associated member reference
  @ApiProperty()
  memberId!: string;

  // Step 4: Member name fields for display
  @ApiProperty()
  memberFirstName!: string;

  @ApiProperty()
  memberLastName!: string;

  // Step 5: Author (leader) who created the note
  @ApiProperty()
  authorId!: string;

  @ApiProperty()
  authorFirstName!: string;

  @ApiProperty()
  authorLastName!: string;

  // Step 6: Decrypted content (never expose encrypted form)
  @ApiProperty({ description: 'Decrypted content of the pastoral note' })
  content!: string;

  // Step 7: Confidentiality access level
  @ApiProperty({
    enum: ['standard', 'confidential', 'restricted'],
  })
  confidentiality!: string;

  // Step 8: Categorization tags
  @ApiProperty({ type: [String] })
  tags!: string[];

  // Step 9: Timestamps for audit trail
  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
