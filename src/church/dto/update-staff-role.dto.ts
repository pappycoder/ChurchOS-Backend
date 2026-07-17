/**
 * @file DTO for updating staff member roles.
 * @module UpdateStaffRoleDto
 * @description Data transfer object for changing a staff member's role.
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for updating a staff member's role.
 * Contains the new role value.
 */
export class UpdateStaffRoleDto {
  @ApiProperty({
    description: 'New role for the staff member',
    enum: ['church_admin', 'branch_pastor', 'secretary', 'treasurer', 'member'],
    example: 'church_admin',
  })
  @IsString()
  @IsNotEmpty()
  role!: string;
}
