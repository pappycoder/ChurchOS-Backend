import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsArray, IsOptional, Min } from 'class-validator';

export class UpdateCustomFieldDto {
  @ApiPropertyOptional({ description: 'Field name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Field type',
    enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea'],
  })
  @IsOptional()
  @IsString()
  field_type?: string;

  @ApiPropertyOptional({ description: 'Options for dropdown or validation config' })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({ description: 'Whether the field is required' })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ description: 'Whether the field is active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
