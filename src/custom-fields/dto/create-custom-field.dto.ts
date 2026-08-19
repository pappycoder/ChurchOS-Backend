import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsArray, IsOptional, Min } from 'class-validator';

export class CreateCustomFieldDto {
  @ApiProperty({ description: 'Field name', example: 'Occupation' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Field type',
    enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea'],
    example: 'text',
  })
  @IsString()
  field_type!: string;

  @ApiPropertyOptional({
    description: 'Options for dropdown or validation config',
    example: ['Engineer', 'Doctor', 'Teacher'],
  })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({ description: 'Whether the field is required', default: false })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  display_order?: number;
}
