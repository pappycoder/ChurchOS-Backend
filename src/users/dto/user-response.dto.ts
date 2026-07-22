/**
 * @file user-response.dto.ts
 * @description DTOs for user management responses.
 *
 * @module users/dto/user-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * User response DTO representing a church staff/user.
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'Profile ID (UUID)',
    example: '22222222-2222-2222-2222-222222222222',
  })
  id!: string;

  @ApiProperty({
    description: 'Supabase Auth user ID',
    example: '11111111-1111-1111-1111-111111111111',
  })
  userId!: string;

  @ApiProperty({
    description: 'Church ID',
    example: '00000000-0000-0000-0000-000000000001',
  })
  churchId!: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '00000000-0000-0000-0000-000000000010',
  })
  branchId?: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  firstName!: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+2348012345678',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://storage.supabase.co/v1/object/public/photos/avatar.jpg',
  })
  avatarUrl?: string;

  @ApiProperty({
    description: 'User role',
    enum: [
      'super_admin',
      'senior_pastor',
      'church_admin',
      'branch_pastor',
      'department_head',
      'secretary',
      'treasurer',
      'member',
    ],
    example: 'church_admin',
  })
  role!: string;

  @ApiProperty({
    description: 'Account status',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  status!: string;

  @ApiProperty({
    description: 'MFA enabled',
    example: false,
  })
  mfaEnabled!: boolean;

  @ApiProperty({
    description: 'Account creation date',
    example: '2026-07-15T10:00:00.000Z',
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description: 'Last update date',
    example: '2026-07-20T15:30:00.000Z',
  })
  updatedAt?: string;
}

/**
 * Paginated user list response.
 */
export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data!: UserResponseDto[];

  @ApiProperty({ description: 'Total user count', example: 15 })
  total!: number;
}
