/**
 * @file analytics.controller.ts
 * @description HTTP endpoints for cross-domain analytics and reporting.
 *
 * Provides aggregated reports for pastors and administrators, including
 * dashboard overviews, giving, attendance, member demographics, events,
 * and communication metrics.
 *
 * @module analytics/analytics.controller
 * @since 1.0.0
 */

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsDateRangeDto, AnalyticsTrendQueryDto } from './dto/analytics-date-range.dto';
import {
  DashboardResponseDto,
  GivingAnalyticsResponseDto,
  AttendanceAnalyticsResponseDto,
  MemberAnalyticsResponseDto,
  EventAnalyticsResponseDto,
  CommunicationAnalyticsResponseDto,
} from './dto/analytics-response.dto';

@ApiTags('Analytics')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Returns a unified dashboard overview.
   */
  @Get('dashboard')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get unified dashboard overview' })
  @ApiOkResponse({ description: 'Dashboard data retrieved', type: DashboardResponseDto })
  async getDashboard(
    @Query() query: AnalyticsDateRangeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DashboardResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getDashboard(churchId, query);
  }

  /**
   * Returns giving analytics.
   */
  @Get('giving')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'treasurer')
  @ApiOperation({ summary: 'Get giving analytics' })
  @ApiOkResponse({ description: 'Giving analytics retrieved', type: GivingAnalyticsResponseDto })
  async getGivingAnalytics(
    @Query() query: AnalyticsTrendQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GivingAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getGivingAnalytics(churchId, query);
  }

  /**
   * Returns attendance analytics.
   */
  @Get('attendance')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get attendance analytics' })
  @ApiOkResponse({
    description: 'Attendance analytics retrieved',
    type: AttendanceAnalyticsResponseDto,
  })
  async getAttendanceAnalytics(
    @Query() query: AnalyticsTrendQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendanceAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getAttendanceAnalytics(churchId, query);
  }

  /**
   * Returns member demographics and growth analytics.
   */
  @Get('members')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get member analytics' })
  @ApiOkResponse({ description: 'Member analytics retrieved', type: MemberAnalyticsResponseDto })
  async getMemberAnalytics(@Req() req: AuthenticatedRequest): Promise<MemberAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getMemberAnalytics(churchId);
  }

  /**
   * Returns event analytics.
   */
  @Get('events')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get event analytics' })
  @ApiOkResponse({ description: 'Event analytics retrieved', type: EventAnalyticsResponseDto })
  async getEventAnalytics(
    @Query() query: AnalyticsDateRangeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EventAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getEventAnalytics(churchId, query);
  }

  /**
   * Returns communication analytics.
   */
  @Get('communication')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get communication analytics' })
  @ApiOkResponse({
    description: 'Communication analytics retrieved',
    type: CommunicationAnalyticsResponseDto,
  })
  async getCommunicationAnalytics(
    @Query() query: AnalyticsDateRangeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommunicationAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getCommunicationAnalytics(churchId, query);
  }
}
