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

// Step 1: Define DTO for creating a new cell group
export class CreateCellGroupDto {
  // Step 1: Cell group name (required, max 100 chars)
  @ApiProperty({ example: 'Victory Cell Group' })
  @IsString()
  @MaxLength(100)
  name!: string;

  // Step 2: Optional leader member ID
  @ApiPropertyOptional({ description: 'Leader member ID' })
  @IsOptional()
  @IsString()
  leaderId?: string;

  // Step 3: Optional latitude for location-based matching (-90 to 90)
  @ApiPropertyOptional({ description: 'Latitude for location-based matching' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  // Step 4: Optional longitude for location-based matching (-180 to 180)
  @ApiPropertyOptional({ description: 'Longitude for location-based matching' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // Step 5: Optional meeting day of the week
  @ApiPropertyOptional({ example: 'Sunday', description: 'Day of the week' })
  @IsOptional()
  @IsString()
  meetingDay?: string;

  // Step 6: Optional meeting time in HH:MM format
  @ApiPropertyOptional({ example: '18:00', description: 'Meeting time (HH:MM)' })
  @IsOptional()
  @IsString()
  meetingTime?: string;
}

// Step 2: Define DTO for querying nearest cell groups by geolocation
export class FindNearestGroupDto {
  // Step 1: User's latitude (required, -90 to 90)
  @ApiProperty({ description: 'User latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  // Step 2: User's longitude (required, -180 to 180)
  @ApiProperty({ description: 'User longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  // Step 3: Optional max results limit (1 to 20, defaults to 5)
  @ApiPropertyOptional({ description: 'Max results', default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;
}
