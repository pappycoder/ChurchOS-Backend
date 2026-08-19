/**
 * @file update-form.dto.ts
 * @description DTO for updating an existing form.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { PartialType } from '@nestjs/swagger';
import { CreateFormDto } from './create-form.dto';

/**
 * Update form DTO. All fields are optional.
 */
export class UpdateFormDto extends PartialType(CreateFormDto) {}
