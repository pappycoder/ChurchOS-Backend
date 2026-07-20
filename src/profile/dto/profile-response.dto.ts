/**
 * @file DTO for profile responses.
 * @module profile/dto/profile-response.dto
 * @description Response DTO for profile endpoints including avatar and role info.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for a single profile.
 * Used for GET /profiles/me, GET /profiles/:id, and list responses.
 */
export class ProfileResponseDto {
  @ApiProperty({ description: 'Profile ID', example: '22222222-2222-2222-2222-222222222222' })
  profileId!: string;

  @ApiProperty({
    description: 'Supabase Auth user ID',
    example: '11111111-1111-1111-1111-111111111111',
  })
  userId!: string;

  @ApiProperty({ description: 'Church ID', example: '00000000-0000-0000-0000-000000000001' })
  churchId!: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '33333333-3333-3333-3333-333333333333',
  })
  branchId?: string;

  @ApiProperty({ description: 'User role', example: 'church_admin' })
  role!: string;

  @ApiProperty({ description: 'First name', example: 'Adebayo' })
  firstName!: string;

  @ApiProperty({ description: 'Last name', example: 'Ogundimu' })
  lastName!: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 803 456 7890' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Profile photo URL',
    example: 'https://xxx.supabase.co/storage/v1/object/public/media/profiles/abc/avatar.webp',
  })
  avatarUrl?: string;

  @ApiProperty({ description: 'MFA enabled', example: false })
  mfaEnabled!: boolean;

  @ApiProperty({ description: 'Profile status', example: 'active' })
  status!: string;

  @ApiProperty({ description: 'Account creation date', example: '2026-07-15T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update date', example: '2026-07-19T14:30:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({
    description: 'Church details',
    example: {
      churchId: '00000000-0000-0000-0000-000000000001',
      name: 'Grace Community Church',
      denomination: 'Pentecostal',
      logoUrl: 'https://example.com/logo.png',
    },
  })
  church?: {
    churchId: string;
    name: string;
    denomination?: string;
    logoUrl?: string;
  };

  @ApiPropertyOptional({
    description: 'Branch details',
    example: {
      branchId: '33333333-3333-3333-3333-333333333333',
      name: 'Headquarters',
      isHeadquarters: true,
    },
  })
  branch?: {
    branchId: string;
    name: string;
    isHeadquarters: boolean;
  };
}
