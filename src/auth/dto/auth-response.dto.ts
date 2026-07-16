/**
 * @file auth-response.dto.ts
 * @description Response DTOs for auth endpoints.
 *
 * @module auth/dto/auth-response
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Supabase Auth user ID',
    example: '11111111-1111-1111-1111-111111111111',
  })
  userId!: string;

  @ApiProperty({ description: 'User email', example: 'pastor@gracecommunity.com' })
  email!: string;

  @ApiProperty({
    description: 'ChurchOS profile ID',
    example: '22222222-2222-2222-2222-222222222222',
  })
  profileId!: string;

  @ApiProperty({ description: 'Church ID', example: '00000000-0000-0000-0000-000000000001' })
  churchId!: string;

  @ApiProperty({ description: 'Church name', example: 'Grace Community Church' })
  churchName!: string;

  @ApiProperty({ description: 'User role', example: 'church_admin' })
  role!: string;
}

export class ProfileResponseDto {
  @ApiProperty({ description: 'Profile ID' })
  id!: string;

  @ApiProperty({ description: 'Supabase Auth user ID' })
  userId!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  branchId?: string;

  @ApiProperty({ description: 'User role' })
  role!: string;

  @ApiProperty({ description: 'First name' })
  firstName!: string;

  @ApiProperty({ description: 'Last name' })
  lastName!: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  phone?: string;

  @ApiProperty({ description: 'MFA enabled' })
  mfaEnabled!: boolean;

  @ApiPropertyOptional({ description: 'Church details' })
  church?: {
    id: string;
    name: string;
    denomination?: string;
    logoUrl?: string;
  };

  @ApiPropertyOptional({ description: 'Branch details' })
  branch?: {
    id: string;
    name: string;
    isHeadquarters: boolean;
  };
}
