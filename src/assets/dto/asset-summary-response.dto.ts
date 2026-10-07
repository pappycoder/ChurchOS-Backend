/**
 * @file Asset summary response DTO.
 * @module assets/dto/asset-summary-response.dto
 * @since 1.0.0
 */

import { ApiProperty } from '@nestjs/swagger';

export class AssetSummaryResponseDto {
  @ApiProperty({ description: 'Total active assets in the register', example: 42 })
  totalAssets!: number;

  @ApiProperty({ description: 'Total purchase value of active assets', example: 12500000 })
  totalPurchaseValue!: number;

  @ApiProperty({ description: 'Total current (book) value of active assets', example: 9800000 })
  totalCurrentValue!: number;
}
