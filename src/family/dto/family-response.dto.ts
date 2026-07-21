/**
 * @file family-response.dto.ts
 * @description Response DTO for family data including member associations.
 *
 * @module family/dto/family-response.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class FamilyMemberDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  memberId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  relationship!: string;

  @ApiProperty()
  isHead!: boolean;
}

export class FamilyResponseDto {
  @ApiProperty()
  familyId!: string;

  @ApiProperty()
  churchId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  headId?: string;

  @ApiProperty({ type: [FamilyMemberDto] })
  members!: FamilyMemberDto[];

  @ApiProperty()
  createdAt!: string;
}
