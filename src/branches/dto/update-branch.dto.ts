/**
 * @file DTO for branch update requests.
 * @module UpdateBranchDto
 * @description Data transfer object for partial branch updates.
 * All fields are optional to support partial updates.
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * DTO for branch update requests.
 * All fields are optional to support partial updates.
 */
export class UpdateBranchDto {
  @ApiPropertyOptional({ description: 'Branch name', example: 'Main Auditorium' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Street address', example: '456 Grace Road' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Lagos' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'State', example: 'Lagos' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+234 803 456 7890' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'main@church.org' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Branch photo URL' })
  @IsString()
  @IsOptional()
  photoUrl?: string;
}
