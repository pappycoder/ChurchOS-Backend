/**
 * @file convert-visitor.dto.ts
 * @description DTO for converting a visitor into a member.
 *
 * @module visitors/dto/convert-visitor.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConvertVisitorDto {
  @ApiProperty({ description: 'First name for the new member' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ description: 'Last name for the new member' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ description: 'Email for the new member' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone for the new member' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Branch ID for the new member' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
