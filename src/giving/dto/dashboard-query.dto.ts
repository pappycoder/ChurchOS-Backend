import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Dashboard readers can select a branch, not probe individual donor totals. */
export class GivingDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Branch filter within the viewer scope' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
