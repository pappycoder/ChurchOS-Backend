/**
 * @file create-cell-group.dto.ts
 * @description DTO for creating a new cell group.
 *
 * Cell groups are small community groups that meet regularly.
 * They have optional geolocation for nearest-group recommendations.
 *
 * @module admin/dto/create-cell-group.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, MaxLength, Min, Max } from 'class-validator';

// Define DTO for creating a new cell group
export class CreateCellGroupDto {
  // Cell group name (required, max 100 chars)
  @ApiProperty({ example: 'Victory Cell Group' })
  @IsString()
  @MaxLength(100)
  name!: string;

  // Optional branch this cell group belongs to
  @ApiPropertyOptional({ description: 'Branch this cell group belongs to' })
  @IsOptional()
  @IsString()
  branchId?: string;

  // Optional meet-up address for the cell group
  @ApiPropertyOptional({ example: '12 Adeola Odeku St, Lekki', description: 'Meet-up address' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  // Optional leader member ID
  @ApiPropertyOptional({ description: 'Leader member ID' })
  @IsOptional()
  @IsString()
  leaderId?: string;

  // Optional latitude for location-based matching (-90 to 90)
  @ApiPropertyOptional({ description: 'Latitude for location-based matching' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  // Optional longitude for location-based matching (-180 to 180)
  @ApiPropertyOptional({ description: 'Longitude for location-based matching' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // Optional meeting day of the week
  @ApiPropertyOptional({ example: 'Sunday', description: 'Day of the week' })
  @IsOptional()
  @IsString()
  meetingDay?: string;

  // Optional meeting time in HH:MM format
  @ApiPropertyOptional({ example: '18:00', description: 'Meeting time (HH:MM)' })
  @IsOptional()
  @IsString()
  meetingTime?: string;
}

// Define DTO for querying nearest cell groups by geolocation
export class FindNearestGroupDto {
  // User's latitude (required, -90 to 90)
  @ApiProperty({ description: 'User latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  // User's longitude (required, -180 to 180)
  @ApiProperty({ description: 'User longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  // Optional max results limit (1 to 20, defaults to 5)
  @ApiPropertyOptional({ description: 'Max results', default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;
}
