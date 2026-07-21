/**
 * @file department-response.dto.ts
 * @description Response DTO for department data.
 *
 * @module admin/dto/department-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Step 1: Define DTO for a department member's summary data
class DepartmentMemberDto {
  // Step 1: Membership record ID
  @ApiProperty()
  id!: string;

  // Step 2: Reference to the member record
  @ApiProperty()
  memberId!: string;

  // Step 3: Member's first name
  @ApiProperty()
  firstName!: string;

  // Step 4: Member's last name
  @ApiProperty()
  lastName!: string;

  // Step 5: Role within the department (e.g. 'member', 'leader')
  @ApiProperty()
  role!: string;

  // Step 6: ISO timestamp of when the member joined
  @ApiProperty()
  joinedAt!: string;
}

// Step 2: Define response DTO for a department
export class DepartmentResponseDto {
  // Step 1: Department unique identifier
  @ApiProperty()
  id!: string;

  // Step 2: Church this department belongs to
  @ApiProperty()
  churchId!: string;

  // Step 3: Department name
  @ApiProperty()
  name!: string;

  // Step 4: Optional department description
  @ApiPropertyOptional()
  description?: string;

  // Step 5: Optional parent department ID for hierarchy
  @ApiPropertyOptional()
  parentId?: string;

  // Step 6: List of members assigned to this department
  @ApiProperty({ type: [DepartmentMemberDto] })
  members!: DepartmentMemberDto[];

  // Step 7: Total count of members in the department
  @ApiProperty()
  memberCount!: number;

  // Step 8: ISO timestamp of when the department was created
  @ApiProperty()
  createdAt!: string;

  // Step 9: ISO timestamp of the last update
  @ApiProperty()
  updatedAt!: string;
}

// Step 3: Define response DTO for a cell group
export class CellGroupResponseDto {
  // Step 1: Cell group unique identifier
  @ApiProperty()
  id!: string;

  // Step 2: Church this cell group belongs to
  @ApiProperty()
  churchId!: string;

  // Step 3: Cell group name
  @ApiProperty()
  name!: string;

  // Step 4: Optional leader member ID
  @ApiPropertyOptional()
  leaderId?: string;

  // Step 5: Optional leader's first name
  @ApiPropertyOptional()
  leaderFirstName?: string;

  // Step 6: Optional leader's last name
  @ApiPropertyOptional()
  leaderLastName?: string;

  // Step 7: Optional latitude for geolocation matching
  @ApiPropertyOptional()
  latitude?: number;

  // Step 8: Optional longitude for geolocation matching
  @ApiPropertyOptional()
  longitude?: number;

  // Step 9: Optional meeting day of the week
  @ApiPropertyOptional()
  meetingDay?: string;

  // Step 10: Optional meeting time in HH:MM format
  @ApiPropertyOptional()
  meetingTime?: string;

  // Step 11: ISO timestamp of when the cell group was created
  @ApiProperty()
  createdAt!: string;

  // Step 12: ISO timestamp of the last update
  @ApiProperty()
  updatedAt!: string;
}

// Step 4: Extend CellGroupResponseDto with distance for nearest-group results
export class NearestGroupResponseDto extends CellGroupResponseDto {
  // Step 1: Distance from the user in kilometers
  @ApiProperty({ description: 'Distance in kilometers' })
  distanceKm!: number;
}
