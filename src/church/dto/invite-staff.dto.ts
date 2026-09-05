/**
 * @file DTO for staff invitation requests.
 * @module InviteStaffDto
 * @description Data transfer object for inviting new staff members.
 * Contains required email, name, role, and optional branch assignment.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for inviting new staff members.
 * Sends Supabase Auth invitation and creates Profile record.
 */
export class InviteStaffDto {
  @ApiProperty({ description: 'Staff member email address', example: 'pastor.james@church.org' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'First name', example: 'James' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ description: 'Last name', example: 'Adeyemi' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 802 345 6789' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'Staff role',
    enum: ['church_admin', 'branch_pastor', 'secretary', 'treasurer', 'member'],
    example: 'branch_pastor',
  })
  @IsString()
  @IsNotEmpty()
  role!: string;

  @ApiPropertyOptional({
    description: 'Branch ID to assign staff to',
    example: '33333333-0000-0000-0000-000000000000',
  })
  @IsString()
  @IsOptional()
  branchId?: string;
}
