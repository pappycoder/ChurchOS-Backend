/**
 * @file reports.controller.ts
 * @description HTTP endpoints for church report generation.
 *
 * @module reports/reports.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { CacheInterceptor, CacheTTL } from '../common/interceptors/cache.interceptor';
import { ReportsService } from './reports.service';
import { ReportQueryDto, ExportReportDto } from './dto/reports-query.dto';
import {
  FinancialReportDto,
  AttendanceReportDto,
  MemberReportDto,
} from './dto/reports-response.dto';

@ApiTags('Reports')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Generate a financial report.
   */
  @Get('financial')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @RequireRoles('church_admin', 'senior_pastor', 'treasurer')
  @RequirePermissions('reports:read')
  @ApiOperation({
    summary: 'Financial report',
    description: 'Giving totals, trends, and breakdown by category.',
  })
  async getFinancialReport(
    @Query() query: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FinancialReportDto> {
    const churchId = req.profile?.church_id || '';
    return this.reportsService.getFinancialReport(
      churchId,
      query.startDate,
      query.endDate,
      query.branchId,
    );
  }

  /**
   * Generate an attendance report.
   */
  @Get('attendance')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('reports:read')
  @ApiOperation({
    summary: 'Attendance report',
    description: 'Attendance totals, trends, and breakdown by service.',
  })
  async getAttendanceReport(
    @Query() query: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendanceReportDto> {
    const churchId = req.profile?.church_id || '';
    return this.reportsService.getAttendanceReport(
      churchId,
      query.startDate,
      query.endDate,
      query.branchId,
    );
  }

  /**
   * Generate a member report.
   */
  @Get('members')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('reports:read')
  @ApiOperation({
    summary: 'Member report',
    description: 'Member demographics, growth, and activity summary.',
  })
  async getMemberReport(
    @Query() query: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberReportDto> {
    const churchId = req.profile?.church_id || '';
    return this.reportsService.getMemberReport(churchId, query.startDate, query.endDate);
  }

  /**
   * Export a report as CSV.
   */
  @Post('export')
  @RequireRoles('church_admin', 'senior_pastor', 'treasurer')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Export report', description: 'Export report data as CSV.' })
  async exportReport(
    @Body() dto: ExportReportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: unknown; format: string }> {
    const churchId = req.profile?.church_id || '';

    let reportData: unknown;
    switch (dto.type) {
      case 'financial':
        reportData = await this.reportsService.getFinancialReport(
          churchId,
          dto.startDate,
          dto.endDate,
          dto.branchId,
        );
        break;
      case 'attendance':
        reportData = await this.reportsService.getAttendanceReport(
          churchId,
          dto.startDate,
          dto.endDate,
          dto.branchId,
        );
        break;
      case 'members':
        reportData = await this.reportsService.getMemberReport(
          churchId,
          dto.startDate,
          dto.endDate,
        );
        break;
      default:
        reportData = null;
    }

    return { data: reportData, format: dto.format || 'csv' };
  }
}
