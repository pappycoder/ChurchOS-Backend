/**
 * @file update-appointment.dto.ts
 * @description DTO for updating an appointment. All fields are optional (partial update).
 *
 * @module appointments/dto/update-appointment.dto
 * @since 1.0.0
 */

import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';

/**
 * DTO for updating an existing appointment. Accepts any subset of the create
 * fields; only provided fields are persisted.
 */
export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {}
