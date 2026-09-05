/**
 * @file update-visitor.dto.ts
 * @description DTO for updating a visitor (partial updates).
 *
 * @module visitors/dto/update-visitor.dto
 * @since 1.0.0
 */

import { PartialType } from '@nestjs/swagger';
import { CreateVisitorDto } from './create-visitor.dto';

/**
 * DTO for updating a visitor. All fields are optional (partial update).
 */
export class UpdateVisitorDto extends PartialType(CreateVisitorDto) {}
