/**
 * @file asset-response.dto.ts
 * @description Response DTO for asset summaries.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetCondition, AssetStatus, DepreciationMethod } from '@prisma/client';

export class AssetResponseDto {
  @ApiProperty({ description: 'Asset ID' })
  id!: string;

  @ApiProperty({ description: 'Church ID' })
  churchId!: string;

  @ApiProperty({ description: 'Unique asset tag' })
  assetTag!: string;

  @ApiProperty({ description: 'Asset name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Asset description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Optional image URL for the asset' })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Category name' })
  categoryName?: string;

  @ApiPropertyOptional({ description: 'Serial number' })
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Brand' })
  brand?: string;

  @ApiPropertyOptional({ description: 'Model' })
  model?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Department name' })
  departmentName?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  branchId?: string;

  @ApiPropertyOptional({ description: 'Branch name' })
  branchName?: string;

  @ApiPropertyOptional({ description: 'Custodian member ID' })
  custodianId?: string;

  @ApiPropertyOptional({ description: 'Custodian name' })
  custodianName?: string;

  @ApiProperty({ description: 'Asset condition', enum: AssetCondition })
  condition!: AssetCondition;

  @ApiProperty({ description: 'Asset status', enum: AssetStatus })
  status!: AssetStatus;

  @ApiPropertyOptional({ description: 'Purchase date' })
  purchaseDate?: string;

  @ApiPropertyOptional({ description: 'Purchase price' })
  purchasePrice?: number;

  @ApiProperty({ description: 'Salvage value' })
  salvageValue!: number;

  @ApiPropertyOptional({ description: 'Useful life in years' })
  usefulLifeYears?: number;

  @ApiProperty({ description: 'Depreciation method', enum: DepreciationMethod })
  depreciationMethod!: DepreciationMethod;

  @ApiPropertyOptional({ description: 'Current value' })
  currentValue?: number;

  @ApiPropertyOptional({ description: 'Storage location' })
  location?: string;

  @ApiPropertyOptional({ description: 'QR code data' })
  qrCode?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
