/**
 * @file create-life-event.dto.ts
 * @description DTO for creating a new life event record.
 *
 * Life events track significant moments in a member's journey:
 * birthdays, weddings, deaths, dedications, baptisms, etc.
 *
 * @module pastoral/dto/create-life-event.dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsObject, IsIn } from 'class-validator';

export class CreateLifeEventDto {
  // Step 1: Require a valid member ID to associate the life event with
  @ApiProperty({
    description: 'ID of the member this life event is about',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  memberId!: string;

  // Step 2: Require a recognized life event type
  @ApiProperty({
    description: 'Type of life event',
    example: 'birthday',
    enum: ['birthday', 'wedding', 'death', 'dedication', 'baptism', 'anniversary', 'other'],
  })
  @IsString()
  @IsIn(['birthday', 'wedding', 'death', 'dedication', 'baptism', 'anniversary', 'other'])
  type!: string;

  // Step 3: Require a valid ISO date string for the event
  @ApiProperty({
    description: 'Date of the life event',
    example: '1990-05-15',
  })
  @IsDateString()
  date!: string;

  // Step 4: Allow optional structured details as a JSON object
  @ApiPropertyOptional({
    description: 'Additional details about the event (JSON object)',
    example: { notes: 'First birthday celebration', gift_sent: true },
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}
