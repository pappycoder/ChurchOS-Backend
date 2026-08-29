/**
 * @file DTO for branch response data.
 * @module BranchResponseDto
 * @description Data transfer object returned for branch queries.
 * Contains branch details, member count, and timestamps.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for branch response data.
 * Contains branch ID, church ID, details, member count, and timestamps.
 */
export class BranchResponseDto {
  @ApiProperty({ description: 'Branch ID', example: '33333333-0000-0000-0000-000000000000' })
  branchId!: string;

  @ApiProperty({ description: 'Church ID', example: '11111111-0000-0000-0000-000000000000' })
  churchId!: string;

  @ApiProperty({ description: 'Branch name', example: 'Main Auditorium' })
  name!: string;

  @ApiProperty({ description: 'Whether this is the headquarters', example: false })
  isHeadquarters!: boolean;

  @ApiPropertyOptional({ description: 'Street address', example: '456 Grace Road' })
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Lagos' })
  city?: string;

  @ApiPropertyOptional({ description: 'State', example: 'Lagos' })
  state?: string;

  @ApiProperty({ description: 'Country', example: 'Nigeria' })
  country!: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 803 456 7890' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'main@church.org' })
  email?: string;

  @ApiPropertyOptional({ description: 'Branch photo URL' })
  photoUrl?: string;

  @ApiProperty({ description: 'Number of members in this branch', example: 50 })
  memberCount!: number;

  @ApiPropertyOptional({ description: 'Set when the branch is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'Created timestamp', example: '2024-01-15T10:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Updated timestamp', example: '2024-06-20T14:00:00.000Z' })
  updatedAt!: string;
}
