/**
 * @file update-service.dto.ts
 * @description DTO for updating a church service (partial updates).
 *
 * @module attendance/dto/update-service.dto
 * @since 1.0.0
 */

import { PartialType } from '@nestjs/swagger';
import { CreateServiceDto } from './create-service.dto';

/**
 * DTO for updating a church service. All fields are optional (partial update).
 */
export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
