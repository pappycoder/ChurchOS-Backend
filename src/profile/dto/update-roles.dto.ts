/**
 * @file DTO for updating a user's roles.
 * @module profile/dto/update-roles.dto
 * @description Data transfer object for admin multi-role updates.
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotIn, IsString } from 'class-validator';

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
  'usher',
  'cell_leader',
] as const;

/**
 * DTO for replacing the full set of roles on a user's profile.
 * Only accessible by super_admin, senior_pastor, and church_admin users.
 */
export class UpdateRolesDto {
  @ApiProperty({
    description: 'Complete set of roles to assign (replaces existing roles)',
    example: ['department_head', 'treasurer'],
    enum: VALID_ROLES,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @IsNotIn(['member'], { each: true })
  roles!: string[];
}
