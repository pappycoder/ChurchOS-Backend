/**
 * @file DTO for church configuration response.
 * @module ChurchConfigResponseDto
 * @description Data transfer object returned for church configuration queries.
 * Contains key-value pairs for church settings.
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for church configuration response.
 * Contains flexible key-value pairs for church settings.
 */
export class ChurchConfigResponseDto {
  @ApiProperty({
    description: 'Church configuration key-value pairs',
    example: {
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      fiscal_year_start: '01',
      attendance_enabled: true,
      whatsapp_enabled: false,
    },
  })
  config!: Record<string, unknown>;
}
