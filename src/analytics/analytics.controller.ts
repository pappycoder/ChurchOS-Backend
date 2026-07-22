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

import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { CacheInterceptor, CacheTTL } from '../common/interceptors/cache.interceptor';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Returns a unified dashboard overview.
   * Cached for 3 minutes since it aggregates data across multiple tables.
   */
  @Get('dashboard')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(180)
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
   * Cached for 5 minutes since giving data changes less frequently.
   */
  @Get('giving')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
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
   * Cached for 3 minutes.
   */
  @Get('attendance')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(180)
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
   * Cached for 10 minutes since member data changes infrequently.
   */
  @Get('members')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get member analytics' })
  @ApiOkResponse({ description: 'Member analytics retrieved', type: MemberAnalyticsResponseDto })
  async getMemberAnalytics(@Req() req: AuthenticatedRequest): Promise<MemberAnalyticsResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.analyticsService.getMemberAnalytics(churchId);
  }

  /**
   * Returns event analytics.
   * Cached for 3 minutes.
   */
  @Get('events')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(180)
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
   * Cached for 5 minutes.
   */
  @Get('communication')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
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
