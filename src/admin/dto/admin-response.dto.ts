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
  @ApiProperty({ description: 'Membership record ID' })
  id!: string;

  @ApiProperty({ description: 'Reference to the member record' })
  memberId!: string;

  @ApiProperty({ description: "Member's first name" })
  firstName!: string;

  @ApiProperty({ description: "Member's last name" })
  lastName!: string;

  @ApiProperty({ description: "Role within the department (e.g. 'member', 'leader')" })
  role!: string;

  @ApiProperty({ description: 'ISO timestamp of when the member joined' })
  joinedAt!: string;
}

// Define response DTO for a department
export class DepartmentResponseDto {
  @ApiProperty({ description: 'Department unique identifier' })
  id!: string;

  @ApiProperty({ description: 'Church this department belongs to' })
  churchId!: string;

  @ApiProperty({ description: 'Department name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Optional department description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Optional parent department ID for hierarchy' })
  parentId?: string;

  @ApiProperty({
    type: [DepartmentMemberDto],
    description: 'List of members assigned to this department',
  })
  members!: DepartmentMemberDto[];

  @ApiProperty({ description: 'Total count of members in the department' })
  memberCount!: number;

  @ApiPropertyOptional({ description: 'Set when the record is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'ISO timestamp of when the department was created' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: string;
}

// Define response DTO for a cell group
export class CellGroupResponseDto {
  @ApiProperty({ description: 'Cell group unique identifier' })
  id!: string;

  @ApiProperty({ description: 'Church this cell group belongs to' })
  churchId!: string;

  @ApiProperty({ description: 'Cell group name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Optional leader member ID' })
  leaderId?: string;

  @ApiPropertyOptional({ description: "Optional leader's first name" })
  leaderFirstName?: string;

  @ApiPropertyOptional({ description: "Optional leader's last name" })
  leaderLastName?: string;

  @ApiPropertyOptional({ description: 'Optional branch this cell group belongs to' })
  branchId?: string;

  @ApiPropertyOptional({ description: "Optional branch's name" })
  branchName?: string;

  @ApiPropertyOptional({
    example: '12 Adeola Odeku St, Lekki',
    description: 'Optional meet-up address',
  })
  address?: string;

  @ApiPropertyOptional({ description: 'Optional latitude for geolocation matching' })
  latitude?: number;

  @ApiPropertyOptional({ description: 'Optional longitude for geolocation matching' })
  longitude?: number;

  @ApiPropertyOptional({ description: 'Optional meeting day of the week' })
  meetingDay?: string;

  @ApiPropertyOptional({ description: 'Optional meeting time in HH:MM format' })
  meetingTime?: string;

  @ApiPropertyOptional({ description: 'Set when the record is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'ISO timestamp of when the cell group was created' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO timestamp of the last update' })
  updatedAt!: string;
}

// Extend CellGroupResponseDto with distance for nearest-group results
export class NearestGroupResponseDto extends CellGroupResponseDto {
  @ApiProperty({ description: 'Distance in kilometers' })
  distanceKm!: number;
}
