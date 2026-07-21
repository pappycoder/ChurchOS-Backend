/**
 * @file create-department.dto.ts
 * @description DTO for creating a new department.
 *
 * @module admin/dto/create-department.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

// Step 1: Define DTO for creating a new department
export class CreateDepartmentDto {
  // Step 1: Department name (required, max 100 chars)
  @ApiProperty({ example: 'Youth Ministry' })
  @IsString()
  @MaxLength(100)
  name!: string;

  // Step 2: Optional description for the department (max 500 chars)
  @ApiPropertyOptional({ example: 'Ministry for youth aged 13-25' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // Step 3: Optional parent department ID for hierarchical structure
  @ApiPropertyOptional({ description: 'Parent department ID for hierarchy' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

// Step 2: Define DTO for adding a member to a department
export class AddDepartmentMemberDto {
  // Step 1: Member UUID to add to the department (required)
  @ApiProperty({ description: 'Member UUID to add' })
  @IsString()
  memberId!: string;

  // Step 2: Optional role within the department (defaults to 'member')
  @ApiPropertyOptional({
    description: 'Role in the department',
    example: 'leader',
    default: 'member',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

// Step 3: Define DTO for updating a department member's role
export class UpdateDepartmentMemberDto {
  // Step 1: New role for the member (required)
  @ApiProperty({ description: 'New role for the member' })
  @IsString()
  role!: string;
}
