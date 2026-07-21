/**
 * @file create-family.dto.ts
 * @description DTO for creating a new family record.
 *
 * Also contains AddFamilyMemberDto for adding a member to an existing family.
 *
 * @module family/dto/create-family.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFamilyDto {
  @ApiProperty({ example: 'Ogundimu Family' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Head member ID' })
  @IsOptional()
  @IsString()
  headId?: string;
}

export class AddFamilyMemberDto {
  @ApiProperty({ description: 'Member UUID to add to the family' })
  @IsString()
  memberId!: string;

  @ApiProperty({
    example: 'spouse',
    description: 'Relationship to head (spouse, child, parent, etc.)',
  })
  @IsString()
  relationship!: string;

  @ApiPropertyOptional({ description: 'Whether this member is the family head' })
  @IsOptional()
  @IsBoolean()
  isHead?: boolean;
}
