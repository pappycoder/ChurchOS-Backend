/**
 * @file create-department.dto.ts
 * @description DTO for creating a new department.
 *
 * @module admin/dto/create-department.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

// Define DTO for creating a new department
export class CreateDepartmentDto {
  // Department name (required, max 100 chars)
  @ApiProperty({ example: 'Youth Ministry' })
  @IsString()
  @MaxLength(100)
  name!: string;

  // Optional description for the department (max 500 chars)
  @ApiPropertyOptional({ example: 'Ministry for youth aged 13-25' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // Optional parent department ID for hierarchical structure
  @ApiPropertyOptional({ description: 'Parent department ID for hierarchy' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

// Define DTO for adding a member to a department
export class AddDepartmentMemberDto {
  // Member UUID to add to the department (required)
  @ApiProperty({ description: 'Member UUID to add' })
  @IsString()
  memberId!: string;

  // Optional role within the department (defaults to 'member')
  @ApiPropertyOptional({
    description: 'Role in the department',
    example: 'leader',
    default: 'member',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

// Define DTO for updating a department member's role
export class UpdateDepartmentMemberDto {
  // New role for the member (required)
  @ApiProperty({ description: 'New role for the member' })
  @IsString()
  role!: string;
}

// Define DTO for adding a member to a cell group
export class AddCellGroupMemberDto {
  // Member UUID to add to the cell group (required)
  @ApiProperty({ description: 'Member UUID to add' })
  @IsString()
  memberId!: string;

  // Optional role within the cell group (defaults to 'member')
  @ApiPropertyOptional({
    description: 'Role in the cell group',
    example: 'leader',
    default: 'member',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

// Define DTO for recording cell group attendance
export class RecordCellGroupAttendanceDto {
  // Member UUID attending (required)
  @ApiProperty({ description: 'Member UUID attending' })
  @IsString()
  memberId!: string;

  // Meeting date (required, ISO string)
  @ApiProperty({ description: 'Meeting date (ISO string)', example: '2026-07-22T10:00:00.000Z' })
  @IsString()
  meetingDate!: string;

  // Attendance status (optional, defaults to 'present')
  @ApiPropertyOptional({
    description: 'Attendance status',
    example: 'present',
    default: 'present',
  })
  @IsOptional()
  @IsString()
  status?: string;

  // Optional notes about the attendance
  @ApiPropertyOptional({ description: 'Optional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
