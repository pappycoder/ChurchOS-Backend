import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MemberDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Branch within the viewer scope' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class MemberDashboardGrowthDto {
  @ApiProperty() date!: string;
  @ApiProperty() total!: number;
  @ApiProperty() members!: number;
  @ApiProperty() visitors!: number;
}

export class MemberDashboardResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus!: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byAgeGroup!: Record<string, number>;
  @ApiProperty({ type: [MemberDashboardGrowthDto] }) growth!: MemberDashboardGrowthDto[];
}
