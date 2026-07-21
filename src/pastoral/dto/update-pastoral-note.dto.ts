/**
 * @file update-pastoral-note.dto.ts
 * @description DTO for updating an existing pastoral note.
 *
 * All fields are optional for partial updates. When content is updated,
 * it will be re-encrypted with AES-256-GCM.
 *
 * @module pastoral/dto/update-pastoral-note.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, MaxLength } from 'class-validator';

export class UpdatePastoralNoteDto {
  // Allow optional content update (will be re-encrypted)
  @ApiPropertyOptional({
    description: 'Updated content of the pastoral note',
    example: 'Follow-up visit completed. Member doing well.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  // Allow optional confidentiality level change
  @ApiPropertyOptional({
    description: 'Updated confidentiality level',
    enum: ['standard', 'confidential', 'restricted'],
  })
  @IsOptional()
  @IsEnum(['standard', 'confidential', 'restricted'])
  confidentiality?: 'standard' | 'confidential' | 'restricted';

  // Allow optional tags replacement
  @ApiPropertyOptional({
    description: 'Updated tags for categorizing the note',
    example: ['prayer', 'follow-up'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
