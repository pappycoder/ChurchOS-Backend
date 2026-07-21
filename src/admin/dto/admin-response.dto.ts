/**
 * @file department-response.dto.ts
 * @description Response DTO for department data.
 *
 * @module admin/dto/department-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Define DTO for a department member's summary data
class DepartmentMemberDto {
  // Membership record ID
  @ApiProperty()
  id!: string;

  // Reference to the member record
  @ApiProperty()
  memberId!: string;

  // Member's first name
  @ApiProperty()
  firstName!: string;

  // Member's last name
  @ApiProperty()
  lastName!: string;

  // Role within the department (e.g. 'member', 'leader')
  @ApiProperty()
  role!: string;

  // ISO timestamp of when the member joined
  @ApiProperty()
  joinedAt!: string;
}

// Define response DTO for a department
export class DepartmentResponseDto {
  // Department unique identifier
  @ApiProperty()
  id!: string;

  // Church this department belongs to
  @ApiProperty()
  churchId!: string;

  // Department name
  @ApiProperty()
  name!: string;

  // Optional department description
  @ApiPropertyOptional()
  description?: string;

  // Optional parent department ID for hierarchy
  @ApiPropertyOptional()
  parentId?: string;

  // List of members assigned to this department
  @ApiProperty({ type: [DepartmentMemberDto] })
  members!: DepartmentMemberDto[];

  // Total count of members in the department
  @ApiProperty()
  memberCount!: number;

  // ISO timestamp of when the department was created
  @ApiProperty()
  createdAt!: string;

  // ISO timestamp of the last update
  @ApiProperty()
  updatedAt!: string;
}

// Define response DTO for a cell group
export class CellGroupResponseDto {
  // Cell group unique identifier
  @ApiProperty()
  id!: string;

  // Church this cell group belongs to
  @ApiProperty()
  churchId!: string;

  // Cell group name
  @ApiProperty()
  name!: string;

  // Optional leader member ID
  @ApiPropertyOptional()
  leaderId?: string;

  // Optional leader's first name
  @ApiPropertyOptional()
  leaderFirstName?: string;

  // Optional leader's last name
  @ApiPropertyOptional()
  leaderLastName?: string;

  // Optional latitude for geolocation matching
  @ApiPropertyOptional()
  latitude?: number;

  // Optional longitude for geolocation matching
  @ApiPropertyOptional()
  longitude?: number;

  // Optional meeting day of the week
  @ApiPropertyOptional()
  meetingDay?: string;

  // Optional meeting time in HH:MM format
  @ApiPropertyOptional()
  meetingTime?: string;

  // ISO timestamp of when the cell group was created
  @ApiProperty()
  createdAt!: string;

  // ISO timestamp of the last update
  @ApiProperty()
  updatedAt!: string;
}

// Extend CellGroupResponseDto with distance for nearest-group results
export class NearestGroupResponseDto extends CellGroupResponseDto {
  // Distance from the user in kilometers
  @ApiProperty({ description: 'Distance in kilometers' })
  distanceKm!: number;
}
