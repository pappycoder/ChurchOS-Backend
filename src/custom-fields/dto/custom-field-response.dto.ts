import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomFieldResponseDto {
  @ApiProperty({ description: 'Field ID' })
  id!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiProperty({ description: 'Field name', example: 'Occupation' })
  name!: string;

  @ApiProperty({
    description: 'Field type',
    enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea'],
  })
  fieldType!: string;

  @ApiPropertyOptional({ description: 'Options for dropdown' })
  options?: string[];

  @ApiProperty({ description: 'Whether the field is required' })
  isRequired!: boolean;

  @ApiProperty({ description: 'Display order' })
  displayOrder!: number;

  @ApiProperty({ description: 'Whether the field is active' })
  isActive!: boolean;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt!: string;
}
