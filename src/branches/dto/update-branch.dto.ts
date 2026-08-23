/**
 * @file DTO for branch update requests.
 * @module UpdateBranchDto
 * @description Extends the create whitelist so update payloads accept exactly
 * the same fields (including isHeadquarters and country) — all optional.
 * @since 1.0.0
 */

import { PartialType } from '@nestjs/mapped-types';
import { CreateBranchDto } from './create-branch.dto';

/**
 * DTO for partial branch updates.
 */
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
