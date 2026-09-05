/**
 * @file family-response.dto.ts
 * @description Response DTO for family data including member associations.
 *
 * @module family/dto/family-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class FamilyMemberDto {
  @ApiProperty({ description: 'Unique identifier for the family member' })
  id!: string;

  @ApiProperty({ description: 'ID of the associated member record' })
  memberId!: string;

  @ApiProperty({ description: 'First name of the family member' })
  firstName!: string;

  @ApiProperty({ description: 'Last name of the family member' })
  lastName!: string;

  @ApiProperty({ description: 'Relationship of this member to the family head' })
  relationship!: string;

  @ApiProperty({ description: 'Whether this member is the head of the family' })
  isHead!: boolean;
}

export class FamilyResponseDto {
  @ApiProperty({ description: 'Unique identifier for the family' })
  familyId!: string;

  @ApiProperty({ description: 'ID of the church the family belongs to' })
  churchId!: string;

  @ApiProperty({ description: 'Family name' })
  name!: string;

  @ApiProperty({ description: 'ID of the family head', nullable: true })
  headId?: string;

  @ApiProperty({ type: [FamilyMemberDto] })
  members!: FamilyMemberDto[];

  @ApiPropertyOptional({ description: 'Set when the family is archived' })
  archivedAt?: string;

  @ApiProperty({ description: 'Timestamp when the family record was created' })
  createdAt!: string;
}
