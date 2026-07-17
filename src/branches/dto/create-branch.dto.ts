/**
 * @file DTO for branch creation requests.
 * @module CreateBranchDto
 * @description Data transfer object for creating a new branch.
 * Name is required; all other fields are optional.
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for creating a new branch.
 * Name is required; headquarters flag, address, and contact details are optional.
 */
export class CreateBranchDto {
  @ApiProperty({ description: 'Branch name', example: 'Main Auditorium' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Whether this is the headquarters branch', default: false })
  @IsBoolean()
  @IsOptional()
  isHeadquarters?: boolean;

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
