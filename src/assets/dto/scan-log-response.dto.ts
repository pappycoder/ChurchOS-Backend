/**
 * @file scan-log-response.dto.ts
 * @description Response DTO for asset scan logs.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScanLogResponseDto {
  @ApiProperty({ description: 'Scan log ID' })
  id!: string;

  @ApiProperty({ description: 'Asset ID' })
  assetId!: string;

  @ApiPropertyOptional({ description: 'Scanned by profile ID' })
  scannedById?: string;

  @ApiProperty({ description: 'Scan type', example: 'check' })
  scanType!: string;

  @ApiPropertyOptional({ description: 'Scan metadata' })
  metadata?: Record<string, unknown>;

  @ApiProperty({ description: 'Scan timestamp' })
  createdAt!: string;
}
