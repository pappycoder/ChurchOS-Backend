/**
 * @file create-asset.dto.ts
 * @description DTO for registering a new asset.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetCondition, AssetStatus, DepreciationMethod } from '@prisma/client';

export class CreateAssetDto {
  @ApiProperty({ description: 'Unique asset tag within the church', example: 'AUD-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assetTag!: string;

  @ApiProperty({ description: 'Asset name', example: 'Yamaha Mixer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Asset description', example: '16-channel audio mixer' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category ID',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Serial number', example: 'SN123456789' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Brand', example: 'Yamaha' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Model', example: 'MG16XU' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({
    description: 'Department ID',
    example: '33333333-3333-3333-3333-333333333333',
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Branch ID',
    example: '44444444-4444-4444-4444-444444444444',
  })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Custodian member ID',
    example: '55555555-5555-5555-5555-555555555555',
  })
  @IsUUID()
  @IsOptional()
  custodianId?: string;

  @ApiPropertyOptional({
    description: 'Asset condition',
    enum: AssetCondition,
    default: AssetCondition.good,
  })
  @IsEnum(AssetCondition)
  @IsOptional()
  condition?: AssetCondition;

  @ApiPropertyOptional({
    description: 'Asset status',
    enum: AssetStatus,
    default: AssetStatus.active,
  })
  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @ApiPropertyOptional({ description: 'Purchase date', example: '2023-01-15' })
  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @ApiPropertyOptional({ description: 'Purchase price', example: 250000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Salvage value', example: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  salvageValue?: number;

  @ApiPropertyOptional({ description: 'Useful life in years', example: 5 })
  @IsInt()
  @IsOptional()
  @Min(1)
  usefulLifeYears?: number;

  @ApiPropertyOptional({
    description: 'Depreciation method',
    enum: DepreciationMethod,
    default: DepreciationMethod.straight_line,
  })
  @IsEnum(DepreciationMethod)
  @IsOptional()
  depreciationMethod?: DepreciationMethod;

  @ApiPropertyOptional({ description: 'Current market/value', example: 200000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  currentValue?: number;

  @ApiPropertyOptional({ description: 'Storage location', example: 'Main Sanctuary' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Purchased during building project',
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
