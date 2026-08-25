/**
 * @file record-bulk-attendance.dto.ts
 * @description DTO for recording multiple attendance check-ins at once.
 *
 * @module attendance/dto/record-bulk-attendance.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SERVICE_CATEGORIES } from './create-service.dto';

@ValidatorConstraint({ name: 'BulkServiceOrEventRequired', async: false })
class BulkServiceOrEventRequired implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const obj = args.object as Record<string, unknown>;
    return !!(obj.serviceId || obj.eventId);
  }
  defaultMessage() {
    return 'Either serviceId or eventId must be provided';
  }
}

/**
 * Individual attendance record within a bulk request.
 */
export class BulkAttendanceRecordDto {
  @ApiPropertyOptional({ description: 'Member ID' })
  @IsUUID()
  @IsOptional()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Visitor ID (links the check-in to a visitor record)' })
  @IsUUID()
  @IsOptional()
  visitorId?: string;

  @ApiPropertyOptional({ description: 'Visitor name' })
  @IsString()
  @IsOptional()
  visitorName?: string;
}

/**
 * DTO for recording multiple attendance check-ins for a single service.
 */
export class RecordBulkAttendanceDto {
  @ApiPropertyOptional({ description: 'Service ID (for service check-in)' })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Event ID (for event check-in)' })
  @IsString()
  @IsOptional()
  eventId?: string;

  @ApiProperty({ description: 'Array of attendance records', type: [BulkAttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceRecordDto)
  @IsNotEmpty()
  records!: BulkAttendanceRecordDto[];

  @ApiPropertyOptional({
    description:
      'Default check-in category for records without their own (falls back to the service category)',
    enum: SERVICE_CATEGORIES,
  })
  @IsOptional()
  @IsIn(SERVICE_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    description: 'Check-in source',
    enum: ['manual', 'qr', 'whatsapp'],
    default: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @Validate(BulkServiceOrEventRequired)
  _serviceOrEvent!: unknown;
}
