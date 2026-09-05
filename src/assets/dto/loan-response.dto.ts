/**
 * @file loan-response.dto.ts
 * @description Response DTO for asset loan records.
 *
 * @module assets/dto
 * @since 1.0.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetCondition, AssetLoanStatus } from '@prisma/client';

export class LoanResponseDto {
  @ApiProperty({ description: 'Loan ID' })
  id!: string;

  @ApiProperty({ description: 'Asset ID' })
  assetId!: string;

  @ApiPropertyOptional({ description: 'Borrower member ID' })
  borrowerMemberId?: string;

  @ApiPropertyOptional({ description: 'Borrower name' })
  borrowerName?: string;

  @ApiProperty({ description: 'Loan date' })
  loanDate!: string;

  @ApiProperty({ description: 'Expected return date' })
  expectedReturnDate!: string;

  @ApiPropertyOptional({ description: 'Actual return date' })
  actualReturnDate?: string;

  @ApiProperty({ description: 'Loan status', enum: AssetLoanStatus })
  status!: AssetLoanStatus;

  @ApiPropertyOptional({ description: 'Condition before loan', enum: AssetCondition })
  conditionBefore?: AssetCondition;

  @ApiPropertyOptional({ description: 'Condition after return', enum: AssetCondition })
  conditionAfter?: AssetCondition;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: string;
}
