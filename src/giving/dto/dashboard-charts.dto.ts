import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { GivingDashboardQueryDto } from './dashboard-query.dto';
import { GivingTrendPointDto } from './transaction-summary-response.dto';

export class GivingDashboardChartsQueryDto extends GivingDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start date (ISO 8601)' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (ISO 8601)' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ default: 'NGN', description: 'Single currency; no conversion' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class GivingDashboardCategoryDto {
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null;
  @ApiProperty() categoryName!: string;
  @ApiProperty() total!: number;
  @ApiProperty() count!: number;
}

export class GivingDashboardChartsResponseDto {
  @ApiProperty() currency!: string;
  @ApiProperty() total!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [GivingTrendPointDto] }) trend!: GivingTrendPointDto[];
  @ApiProperty({ type: [GivingDashboardCategoryDto] }) byCategory!: GivingDashboardCategoryDto[];
}
