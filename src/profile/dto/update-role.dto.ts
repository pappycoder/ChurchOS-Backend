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
  'church_admin',
  'branch_pastor',
  'secretary',
  'treasurer',
  'cell_leader',
  'usher',
  'worship_leader',
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
