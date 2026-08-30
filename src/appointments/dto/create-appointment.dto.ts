/**
 * @file create-appointment.dto.ts
 * @description DTO for creating an appointment.
 *
 * @module appointments/dto/create-appointment.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { APPOINTMENT_STATUS } from './appointment-response.dto';

export type AppointmentCreatorSide = 'secretary' | 'pastor';

/**
 * DTO for creating a new appointment in the booking registry.
 */
export class CreateAppointmentDto {
  @ApiProperty({ description: 'Appointment title', example: 'Budget planning' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Scheduled date/time (ISO 8601)',
    example: '2026-09-05T10:00:00.000Z',
  })
  @IsISO8601()
  scheduledAt!: string;

  @ApiProperty({
    description:
      'The counterpart Profile ID. For a secretary this is the pastor; for a ' +
      'pastor this is the secretary.',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID('4')
  counterpartId!: string;

  @ApiPropertyOptional({ description: 'Location', example: 'Main Campus — Office 2' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Purpose / notes', example: 'Review Q3 outreach plans' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Status',
    enum: APPOINTMENT_STATUS,
    default: 'pending',
    example: 'pending',
  })
  @IsIn(APPOINTMENT_STATUS)
  @IsOptional()
  status?: string;
}
