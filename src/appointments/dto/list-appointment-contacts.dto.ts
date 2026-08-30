/**
 * @file list-appointment-contacts.dto.ts
 * @description DTO for listing appointment counterpart contacts (the pairing picker).
 *
 * @module appointments/dto/list-appointment-contacts.dto
 * @since 1.0.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for listing the selectable counterpart set when creating/editing an
 * appointment. The counterpart chosen depends on who is acting:
 *  - A secretary creates an appointment WITH a pastor (the "pastor" side).
 *  - A pastor creates an appointment WITH a secretary (the role/side they pick).
 * `role` filters by exact role; `branchId` filters by branch.
 */
export class ListAppointmentContactsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50, example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Search by first name, last name, or email',
    example: 'Pastor',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Restrict to the pastor side (branch_pastor/church_admin/senior_pastor)',
    example: true,
  })
  @Type(() => Boolean)
  @IsOptional()
  pastorsOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by exact role',
    example: 'branch_pastor',
  })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({
    description: 'Filter by branch ID',
    example: '33333333-3333-3333-3333-333333333333',
  })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}
