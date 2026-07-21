/**
 * @file depreciation-response.dto.ts
 * @description Response DTO for asset depreciation entries.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class DepreciationResponseDto {
  @ApiProperty({ description: 'Depreciation entry ID' })
  id!: string;

  @ApiProperty({ description: 'Asset ID' })
  assetId!: string;

  @ApiProperty({ description: 'Fiscal year', example: 2026 })
  year!: number;

  @ApiProperty({ description: 'Opening value at start of year', example: 250000 })
  openingValue!: number;

  @ApiProperty({ description: 'Depreciation amount for the year', example: 50000 })
  depreciationAmount!: number;

  @ApiProperty({ description: 'Closing value at end of year', example: 200000 })
  closingValue!: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;
}

export class DepreciationSummaryResponseDto {
  @ApiProperty({ description: 'Asset ID' })
  assetId!: string;

  @ApiProperty({ description: 'Original purchase price', example: 250000 })
  purchasePrice!: number;

  @ApiProperty({ description: 'Total depreciation recorded', example: 50000 })
  totalDepreciation!: number;

  @ApiProperty({ description: 'Current book value', example: 200000 })
  currentValue!: number;

  @ApiProperty({ description: 'Depreciation entries' })
  entries!: DepreciationResponseDto[];
}
