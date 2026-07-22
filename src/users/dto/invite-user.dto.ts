/**
 * @file invite-user.dto.ts
 * @description DTO for inviting a new user.
 *
 * @module users/dto/invite-user.dto
 * @since 1.0.0
 */

import { IsEmail, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VALID_ROLES = [
  'senior_pastor',
  'church_admin',
  'branch_pastor',
  'department_head',
  'secretary',
  'treasurer',
  'member',
] as const;

export class InviteUserDto {
  @ApiProperty({
    description: 'Email address of the user to invite',
    example: 'john.doe@church.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'User role',
    enum: VALID_ROLES,
    example: 'church_admin',
  })
  @IsIn(VALID_ROLES)
  @IsNotEmpty()
  role!: string;

  @ApiPropertyOptional({
    description: 'Branch ID to assign the user to',
    example: '00000000-0000-0000-0000-000000000010',
  })
  @IsString()
  @IsOptional()
  branchId?: string;
}
