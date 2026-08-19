/**
 * @file DTO for updating a user's role.
 * @module profile/dto/update-role.dto
 * @description Data transfer object for admin role updates.
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * Valid roles that can be assigned to a profile.
 */
const VALID_ROLES = [
  'super_admin',
  'senior_pastor',
  'church_admin',
  'branch_pastor',
  'department_head',
  'secretary',
  'treasurer',
  'member',
] as const;

/**
 * DTO for updating a user's role.
 * Only accessible by church_admin users.
 */
export class UpdateRoleDto {
  @ApiProperty({
    description: 'New role to assign',
    example: 'church_admin',
    enum: VALID_ROLES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_ROLES)
  role!: string;
}
