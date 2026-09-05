/**
 * @file form-field.dto.ts
 * @description DTOs for form field definitions.
 *
 * Defines the supported field types, validation rules, and the structure
 * of a single field inside a form's `fields` JSON array.
 *
 * @module forms/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Supported form field types.
 */
export enum FormFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  DATE = 'date',
  DROPDOWN = 'dropdown',
  CHECKBOX = 'checkbox',
  EMAIL = 'email',
  PHONE = 'phone',
}

/**
 * Optional validation rules for a form field.
 */
export class FormFieldValidationDto {
  @ApiPropertyOptional({ description: 'Minimum numeric value or length', example: 1 })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiPropertyOptional({ description: 'Maximum numeric value or length', example: 100 })
  @IsNumber()
  @IsOptional()
  max?: number;

  @ApiPropertyOptional({ description: 'Regex pattern string', example: '^[A-Za-z]+$' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  pattern?: string;
}

/**
 * Single field definition inside a form.
 */
export class FormFieldDto {
  @ApiProperty({ description: 'Machine-readable field key', example: 'full_name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key!: string;

  @ApiProperty({ description: 'Human-readable field label', example: 'Full Name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ description: 'Field type', enum: FormFieldType, example: FormFieldType.TEXT })
  @IsEnum(FormFieldType)
  type!: FormFieldType;

  @ApiPropertyOptional({ description: 'Whether the field is required', example: true })
  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Allowed options for dropdown or checkbox fields',
    example: ['Option 1', 'Option 2'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @ApiPropertyOptional({ description: 'Optional validation rules' })
  @ValidateNested()
  @Type(() => FormFieldValidationDto)
  @IsOptional()
  validation?: FormFieldValidationDto;
}
