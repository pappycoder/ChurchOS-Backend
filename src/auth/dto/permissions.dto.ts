/**
 * @file DTOs for permission management endpoints.
 * @module auth/dto/permissions.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';

/**
 * DTO for setting permissions for a role.
 */
export class SetRolePermissionsDto {
  @ApiProperty({
    description: 'Array of permission IDs to assign to this role',
    example: ['perm-id-1', 'perm-id-2'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty()
  permissionIds!: string[];
}

/**
 * Response DTO for a single permission.
 */
export class PermissionResponseDto {
  @ApiProperty({ description: 'Permission ID' })
  id!: string;

  @ApiProperty({ description: 'Permission name (resource:action)', example: 'members:read' })
  name!: string;

  @ApiProperty({ description: 'Resource name', example: 'members' })
  resource!: string;

  @ApiProperty({ description: 'Action name', example: 'read' })
  action!: string;
}

/**
 * Response DTO for a role with its permissions.
 */
export class RolePermissionsResponseDto {
  @ApiProperty({ description: 'Role name', example: 'secretary' })
  roleName!: string;

  @ApiProperty({ description: 'Role description', example: 'Church secretary', nullable: true })
  description!: string | null;

  @ApiProperty({
    description: 'Effective permissions for this role',
    type: [PermissionResponseDto],
  })
  permissions!: PermissionResponseDto[];

  @ApiProperty({ description: 'Whether this role has church-specific overrides', example: false })
  isCustomized!: boolean;
}

/**
 * Response DTO for the roles summary (all roles for a church).
 */
export class RolesSummaryResponseDto {
  @ApiProperty({
    description: 'All roles with their permissions',
    type: [RolePermissionsResponseDto],
  })
  roles!: RolePermissionsResponseDto[];
}
