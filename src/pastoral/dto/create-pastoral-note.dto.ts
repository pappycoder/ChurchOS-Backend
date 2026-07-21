/**
 * @file create-pastoral-note.dto.ts
 * @description DTO for creating a new pastoral note.
 *
 * Pastoral notes are used by church leaders to record counseling sessions,
 * prayer requests, pastoral visits, and other ministry interactions.
 * Content is encrypted at rest using AES-256-GCM.
 *
 * @module pastoral/dto/create-pastoral-note.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, MaxLength } from 'class-validator';

export class CreatePastoralNoteDto {
  // Require a valid member ID to associate the note with
  @ApiProperty({
    description: 'ID of the member this note is about',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  memberId!: string;

  // Set default confidentiality level to standard
  @ApiProperty({
    description: 'Confidentiality level for this note',
    enum: ['standard', 'confidential', 'restricted'],
    default: 'standard',
  })
  @IsOptional()
  @IsEnum(['standard', 'confidential', 'restricted'])
  confidentiality?: 'standard' | 'confidential' | 'restricted';

  // Require note content with a max length of 5000 characters
  @ApiProperty({
    description: 'Content of the pastoral note (will be encrypted at rest)',
    example: 'Member expressed concerns about family health issues.',
  })
  @IsString()
  @MaxLength(5000)
  content!: string;

  // Allow optional tags for categorization
  @ApiPropertyOptional({
    description: 'Tags for categorizing the note',
    example: ['prayer', 'follow-up', 'counseling'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
