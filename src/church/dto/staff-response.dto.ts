/**
 * @file DTO for staff member response data.
 * @module StaffResponseDto
 * @description Data transfer object returned for staff queries.
 * Contains profile details, role, and branch assignment.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for staff member response data.
 * Contains profile ID, user ID, email, name, role, and branch.
 */
export class StaffResponseDto {
  @ApiProperty({ description: 'Profile ID', example: '55555555-0000-0000-0000-000000000000' })
  profileId!: string;

  @ApiProperty({
    description: 'Supabase Auth user ID',
    example: '66666666-0000-0000-0000-000000000000',
  })
  userId!: string;

  @ApiProperty({ description: 'Email address', example: 'pastor.james@church.org' })
  email!: string;

  @ApiProperty({ description: 'First name', example: 'James' })
  firstName!: string;

  @ApiProperty({ description: 'Last name', example: 'Adeyemi' })
  lastName!: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 802 345 6789' })
  phone?: string;

  @ApiProperty({ description: 'Staff role', example: 'branch_pastor' })
  role!: string;

  @ApiPropertyOptional({ description: 'Branch name', example: 'Main Auditorium' })
  branchName?: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '33333333-0000-0000-0000-000000000000',
  })
  branchId?: string;

  @ApiProperty({ description: 'Profile created timestamp', example: '2024-03-10T09:00:00.000Z' })
  createdAt!: string;
}
