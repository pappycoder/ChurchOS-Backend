/**
 * @file admin.controller.ts
 * @description HTTP endpoints for department and cell group management.
 *
 * Provides REST endpoints for department CRUD with member assignments,
 * and cell group CRUD with nearest-group geolocation recommendations.
 *
 * All endpoints require JWT authentication. Write operations are
 * restricted to admin and pastor roles.
 *
 * @module admin/admin.controller
 * @since 1.0.0
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CurrentUser,
  SupabaseUser,
  AuthenticatedRequest,
} from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ScoringService } from '../pastoral/scoring.service';
import {
  CreateDepartmentDto,
  AddDepartmentMemberDto,
  AddCellGroupMemberDto,
  RecordCellGroupAttendanceDto,
} from './dto/create-department.dto';
import { CreateCellGroupDto } from './dto/create-cell-group.dto';
import {
  DepartmentResponseDto,
  CellGroupResponseDto,
  NearestGroupResponseDto,
} from './dto/admin-response.dto';

@ApiTags('Admin')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    // Inject AdminService for department and cell group operations
    private readonly adminService: AdminService,
    // Inject ScoringService for dashboard analytics endpoints
    private readonly scoringService: ScoringService,
  ) {}

  // ─── Departments ──────────────────────────────────────────

  /**
   * Creates a new department.
   */
  @Post('departments')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('departments:create')
  @ApiOperation({ summary: 'Create a new department' })
  async createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepartmentResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to create the department
    return this.adminService.createDepartment(dto, churchId, user.sub);
  }

  /**
   * Lists all departments for the church.
   */
  @Get('departments')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('departments:read')
  @ApiOperation({ summary: 'List departments' })
  async listDepartments(@Req() req: AuthenticatedRequest): Promise<DepartmentResponseDto[]> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to list all departments
    return this.adminService.listDepartments(churchId);
  }

  /**
   * Gets a single department by ID.
   */
  @Get('departments/:departmentId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('departments:read')
  @ApiParam({ name: 'departmentId', type: String })
  @ApiOperation({ summary: 'Get a department by ID' })
  async getDepartmentById(
    @Param('departmentId') departmentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepartmentResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to fetch the department by ID
    return this.adminService.getDepartmentById(departmentId, churchId);
  }

  /**
   * Updates a department.
   */
  @Patch('departments/:departmentId')
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('departments:update')
  @ApiParam({ name: 'departmentId', type: String })
  @ApiOperation({ summary: 'Update a department' })
  async updateDepartment(
    @Param('departmentId') departmentId: string,
    @Body() dto: Partial<CreateDepartmentDto>,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<DepartmentResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to update the department
    return this.adminService.updateDepartment(departmentId, dto, churchId, user.sub);
  }

  /**
   * Deletes a department (must have no members).
   */
  @Delete('departments/:departmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin')
  @RequirePermissions('departments:delete')
  @ApiParam({ name: 'departmentId', type: String })
  @ApiOperation({ summary: 'Delete a department (must have no members)' })
  async deleteDepartment(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to delete the department
    return this.adminService.deleteDepartment(departmentId, churchId, user.sub);
  }

  /**
   * Adds a member to a department.
   */
  @Post('departments/:departmentId/members')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('departments:update')
  @ApiParam({ name: 'departmentId', type: String })
  @ApiOperation({ summary: 'Add a member to a department' })
  async addDepartmentMember(
    @Param('departmentId') departmentId: string,
    @Body() dto: AddDepartmentMemberDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to add the member to the department
    return this.adminService.addDepartmentMember(departmentId, dto, churchId, user.sub);
  }

  /**
   * Removes a member from a department.
   */
  @Delete('departments/:departmentId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('departments:update')
  @ApiParam({ name: 'departmentId', type: String })
  @ApiParam({ name: 'memberId', type: String })
  @ApiOperation({ summary: 'Remove a member from a department' })
  async removeDepartmentMember(
    @Param('departmentId') departmentId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to remove the member from the department
    return this.adminService.removeDepartmentMember(departmentId, memberId, churchId, user.sub);
  }

  // ─── Cell Groups ──────────────────────────────────────────

  /**
   * Creates a new cell group.
   */
  @Post('cell-groups')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('cell_groups:create')
  @ApiOperation({ summary: 'Create a new cell group' })
  async createCellGroup(
    @Body() dto: CreateCellGroupDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<CellGroupResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to create the cell group
    return this.adminService.createCellGroup(dto, churchId, user.sub);
  }

  /**
   * Lists all cell groups for the church.
   */
  @Get('cell-groups')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader')
  @RequirePermissions('cell_groups:read')
  @ApiOperation({ summary: 'List cell groups' })
  async listCellGroups(@Req() req: AuthenticatedRequest): Promise<CellGroupResponseDto[]> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to list all cell groups
    return this.adminService.listCellGroups(churchId);
  }

  /**
   * Finds nearest cell groups based on geolocation.
   */
  @Get('cell-groups/nearest')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'member')
  @ApiOperation({ summary: 'Find nearest cell groups by location' })
  async findNearestGroups(
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('limit') limit: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<NearestGroupResponseDto[]> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to find nearest groups, default limit 5
    return this.adminService.findNearestGroups(latitude, longitude, churchId, limit || 5);
  }

  /**
   * Gets a single cell group by ID.
   */
  @Get('cell-groups/:groupId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader')
  @RequirePermissions('cell_groups:read')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Get a cell group by ID' })
  async getCellGroupById(
    @Param('groupId') groupId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CellGroupResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to fetch the cell group by ID
    return this.adminService.getCellGroupById(groupId, churchId);
  }

  /**
   * Updates a cell group.
   */
  @Patch('cell-groups/:groupId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('cell_groups:update')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Update a cell group' })
  async updateCellGroup(
    @Param('groupId') groupId: string,
    @Body() dto: Partial<CreateCellGroupDto>,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<CellGroupResponseDto> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to update the cell group
    return this.adminService.updateCellGroup(groupId, dto, churchId, user.sub);
  }

  /**
   * Deletes a cell group.
   */
  @Delete('cell-groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('cell_groups:delete')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Delete a cell group' })
  async deleteCellGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to AdminService to delete the cell group
    return this.adminService.deleteCellGroup(groupId, churchId, user.sub);
  }

  // ─── Cell Group Members ───────────────────────────────────

  /**
   * Adds a member to a cell group.
   */
  @Post('cell-groups/:groupId/members')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('cell_groups:create')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Add a member to a cell group' })
  async addCellGroupMember(
    @Param('groupId') groupId: string,
    @Body() dto: AddCellGroupMemberDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.adminService.addCellGroupMember(
      groupId,
      dto.memberId,
      dto.role || 'member',
      churchId,
      user.sub,
    );
  }

  /**
   * Removes a member from a cell group.
   */
  @Delete('cell-groups/:groupId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('cell_groups:update')
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'memberId', type: String })
  @ApiOperation({ summary: 'Remove a member from a cell group' })
  async removeCellGroupMember(
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.adminService.removeCellGroupMember(groupId, memberId, churchId, user.sub);
  }

  /**
   * Lists members of a cell group.
   */
  @Get('cell-groups/:groupId/members')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'department_head', 'cell_leader')
  @RequirePermissions('cell_groups:read')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'List cell group members' })
  async listCellGroupMembers(@Param('groupId') groupId: string, @Req() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    return this.adminService.listCellGroupMembers(groupId, churchId);
  }

  // ─── Cell Group Attendance ────────────────────────────────

  /**
   * Records attendance for a cell group meeting.
   */
  @Post('cell-groups/:groupId/attendance')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('cell_groups:create')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Record cell group attendance' })
  async recordCellGroupAttendance(
    @Param('groupId') groupId: string,
    @Body() dto: RecordCellGroupAttendanceDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    await this.adminService.recordCellGroupAttendance(
      groupId,
      dto.memberId,
      dto.visitorId,
      dto.visitorName,
      dto.meetingDate,
      dto.status || 'present',
      dto.notes,
      churchId,
      user.sub,
    );
  }

  /**
   * Lists attendance records for a cell group.
   */
  @Get('cell-groups/:groupId/attendance')
  @RequireRoles(
    'church_admin',
    'senior_pastor',
    'branch_pastor',
    'secretary',
    'department_head',
    'cell_leader',
  )
  @RequirePermissions('cell_groups:read')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'List cell group attendance' })
  async listCellGroupAttendance(
    @Param('groupId') groupId: string,
    @Query('meetingDate') meetingDate: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    return this.adminService.listCellGroupAttendance(groupId, churchId, meetingDate);
  }

  /**
   * Gets attendance summary for a cell group.
   */
  @Get('cell-groups/:groupId/attendance/summary')
  @RequireRoles(
    'church_admin',
    'senior_pastor',
    'branch_pastor',
    'secretary',
    'department_head',
    'cell_leader',
  )
  @RequirePermissions('cell_groups:read')
  @ApiParam({ name: 'groupId', type: String })
  @ApiOperation({ summary: 'Get cell group attendance summary' })
  async getCellGroupAttendanceSummary(
    @Param('groupId') groupId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    return this.adminService.getCellGroupAttendanceSummary(groupId, churchId);
  }

  // ─── Dashboard ────────────────────────────────────────────

  /**
   * Gets members needing pastoral attention (high/critical risk).
   */
  @Get('dashboard/attention')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get members needing pastoral attention' })
  async getMembersNeedingAttention(
    @Query('limit') limit: number,
    @Req() req: AuthenticatedRequest,
  ) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to ScoringService to get high-risk members, default limit 20
    return this.scoringService.getMembersNeedingAttention(churchId, limit || 20);
  }

  /**
   * Gets engagement distribution across the church.
   */
  @Get('dashboard/engagement')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get engagement score distribution' })
  async getEngagementDistribution(@Req() req: AuthenticatedRequest) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to ScoringService to get engagement distribution
    return this.scoringService.getEngagementDistribution(churchId);
  }

  /**
   * Gets rising stars — members with rapidly improving engagement.
   */
  @Get('dashboard/rising-stars')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @ApiOperation({ summary: 'Get rising star members' })
  async getRisingStars(@Query('limit') limit: number, @Req() req: AuthenticatedRequest) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to ScoringService to get rising stars, default limit 10
    return this.scoringService.getRisingStars(churchId, limit || 10);
  }

  /**
   * Gets follow-up suggestions for a specific member.
   */
  @Get('dashboard/follow-up/:memberId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @ApiParam({ name: 'memberId', type: String })
  @ApiOperation({
    summary: 'Get follow-up suggestions for a member',
    description:
      "Analyzes a member's risk factors and returns actionable follow-up suggestions for pastoral staff.",
  })
  async getMemberFollowUp(@Param('memberId') memberId: string, @Req() req: AuthenticatedRequest) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to ScoringService to analyze risk factors and generate suggestions
    return this.scoringService.getFollowUpSuggestions(memberId, churchId);
  }

  /**
   * Gets follow-up suggestions for all high/critical risk members.
   */
  @Get('dashboard/follow-up')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @ApiOperation({
    summary: 'Get batch follow-up suggestions',
    description:
      'Returns follow-up suggestions for all members currently flagged as high or critical risk.',
  })
  async getBatchFollowUp(@Query('limit') limit: number, @Req() req: AuthenticatedRequest) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate to ScoringService to get suggestions for all at-risk members, default limit 20
    return this.scoringService.getBatchFollowUpSuggestions(churchId, limit || 20);
  }

  /**
   * Manually triggers nightly score recalculation for a church.
   */
  @Post('dashboard/recalculate-scores')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pastoral:update')
  @ApiOperation({ summary: 'Trigger manual score recalculation' })
  async recalculateScores(@Req() req: AuthenticatedRequest) {
    // Extract church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Run engagement and risk score calculations in parallel
    const [engagementScored, riskScored] = await Promise.all([
      this.scoringService.calculateEngagementScores(churchId),
      this.scoringService.calculateRiskScores(churchId),
    ]);
    // Return the counts of members scored in each category
    return { engagementScored, riskScored };
  }

  // ─── Multi-Church Federation (Super Admin) ───────────────

  /**
   * Lists all churches (super_admin only).
   */
  @Get('churches')
  @RequireRoles('super_admin')
  @RequirePermissions('church:read')
  @ApiOperation({
    summary: 'List all churches',
    description:
      'Returns a summary of all churches. Only accessible by super_admin users for multi-church management.',
  })
  async listAllChurches() {
    return this.adminService.listAllChurches();
  }

  /**
   * Gets cross-church analytics (super_admin only).
   */
  @Get('analytics/cross-church')
  @RequireRoles('super_admin')
  @RequirePermissions('analytics:read')
  @ApiOperation({
    summary: 'Cross-church analytics',
    description: 'Aggregates key metrics across all churches for super_admin oversight.',
  })
  async getCrossChurchAnalytics() {
    return this.adminService.getCrossChurchAnalytics();
  }
}
