/**
 * @file reports.controller.ts
 * @description HTTP endpoints for church report generation.
 *
 * @module reports/reports.controller
 * @since 1.0.0
 */

import {
  Controller,
  ForbiddenException,
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
  @RequirePermissions('reports:financial:read')
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
      req.profile?.is_admin_hq ? query.branchId : req.profile?.branch_id,
    );
  }

  /**
   * Generate an attendance report.
   */
  @Get('attendance')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('reports:attendance:read')
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
      req.profile?.is_admin_hq ? query.branchId : req.profile?.branch_id,
    );
  }

  /**
   * Generate a member report.
   */
  @Get('members')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('reports:members:read')
  @ApiOperation({
    summary: 'Member report',
    description: 'Member demographics, growth, and activity summary.',
  })
  async getMemberReport(
    @Query() query: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberReportDto> {
    const churchId = req.profile?.church_id || '';
    return this.reportsService.getMemberReport(
      churchId,
      query.startDate,
      query.endDate,
      req.profile?.is_admin_hq ? query.branchId : req.profile?.branch_id,
    );
  }

  /**
   * Export a report as CSV.
   */
  @Post('export')
  @RequirePermissions('reports:view')
  @ApiOperation({ summary: 'Export report', description: 'Export report data as CSV.' })
  async exportReport(
    @Body() dto: ExportReportDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: unknown; format: string }> {
    const requiredPermission = `reports:${dto.type}:read`;
    if (!req.profile?.permissions?.includes(requiredPermission)) {
      throw new ForbiddenException(`Access denied. Missing permissions: ${requiredPermission}`);
    }

    const churchId = req.profile?.church_id || '';

    let reportData: unknown;
    switch (dto.type) {
      case 'financial':
        reportData = await this.reportsService.getFinancialReport(
          churchId,
          dto.startDate,
          dto.endDate,
          req.profile?.is_admin_hq ? dto.branchId : req.profile?.branch_id,
        );
        break;
      case 'attendance':
        reportData = await this.reportsService.getAttendanceReport(
          churchId,
          dto.startDate,
          dto.endDate,
          req.profile?.is_admin_hq ? dto.branchId : req.profile?.branch_id,
        );
        break;
      case 'members':
        reportData = await this.reportsService.getMemberReport(
          churchId,
          dto.startDate,
          dto.endDate,
          req.profile?.is_admin_hq ? dto.branchId : req.profile?.branch_id,
        );
        break;
      default:
        reportData = null;
    }

    return { data: reportData, format: dto.format || 'csv' };
  }
}
