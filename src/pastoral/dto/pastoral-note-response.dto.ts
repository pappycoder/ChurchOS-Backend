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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PastoralNoteResponseDto {
  @ApiProperty({ description: 'Unique identifier for the pastoral note' })
  id!: string;

  @ApiProperty({ description: 'Multi-tenant church scope identifier' })
  churchId!: string;

  @ApiProperty({ description: 'Associated member reference ID' })
  memberId!: string;

  @ApiProperty({ description: 'First name of the associated member' })
  memberFirstName!: string;

  @ApiProperty({ description: 'Last name of the associated member' })
  memberLastName!: string;

  @ApiProperty({ description: 'Author (leader) who created the note' })
  authorId!: string;

  @ApiProperty({ description: 'First name of the author' })
  authorFirstName!: string;

  @ApiProperty({ description: 'Last name of the author' })
  authorLastName!: string;

  @ApiProperty({ description: 'Decrypted content of the pastoral note' })
  content!: string;

  @ApiProperty({
    description: 'Confidentiality access level',
    enum: ['standard', 'confidential', 'restricted'],
  })
  confidentiality!: string;

  @ApiProperty({ description: 'Categorization tags', type: [String] })
  tags!: string[];

  @ApiPropertyOptional({ description: 'Set when the record is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
