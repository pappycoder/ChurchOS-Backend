import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  AuthenticatedRequest,
  CurrentUser,
  SupabaseUser,
} from '../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import {
  GeneralAttendanceCountsDto,
  GeneralAttendanceQueryDto,
  RecordAttendanceSessionDto,
} from './dto/general-attendance.dto';

@ApiTags('Attendance sessions')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class AttendanceSessionsController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('events/:contextId/attendance-sessions')
  @RequirePermissions('events:checkin:create')
  recordEvent(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Body() dto: RecordAttendanceSessionDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.recordSession(
      'event',
      contextId,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }
  @Get('events/:contextId/attendance-sessions')
  @RequirePermissions('events:checkin:read')
  listEvent(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.listSessions(
      'event',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Get('events/:contextId/attendance-sessions/summary')
  @RequirePermissions('events:checkin:read')
  summaryEvent(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.sessionSummary(
      'event',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Patch('events/:contextId/attendance-sessions/:id')
  @RequirePermissions('events:checkin:update')
  updateEvent(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneralAttendanceCountsDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.updateSession(
      'event',
      contextId,
      id,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }

  @Post('admin/departments/:contextId/attendance-sessions')
  @RequirePermissions('departments:update')
  recordDepartment(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Body() dto: RecordAttendanceSessionDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.recordSession(
      'department',
      contextId,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }
  @Get('admin/departments/:contextId/attendance-sessions')
  @RequirePermissions('departments:read')
  listDepartment(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.listSessions(
      'department',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Get('admin/departments/:contextId/attendance-sessions/summary')
  @RequirePermissions('departments:read')
  summaryDepartment(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.sessionSummary(
      'department',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Patch('admin/departments/:contextId/attendance-sessions/:id')
  @RequirePermissions('departments:update')
  updateDepartment(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneralAttendanceCountsDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.updateSession(
      'department',
      contextId,
      id,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }

  @Post('admin/cell-groups/:contextId/attendance-sessions')
  @RequirePermissions('cell_groups:create')
  recordCellGroup(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Body() dto: RecordAttendanceSessionDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.recordSession(
      'cell_group',
      contextId,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }
  @Get('admin/cell-groups/:contextId/attendance-sessions')
  @RequirePermissions('cell_groups:details:read')
  listCellGroup(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.listSessions(
      'cell_group',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Get('admin/cell-groups/:contextId/attendance-sessions/summary')
  @RequirePermissions('cell_groups:details:read')
  summaryCellGroup(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: GeneralAttendanceQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.sessionSummary(
      'cell_group',
      contextId,
      req.profile!.church_id,
      query,
      req.profile,
    );
  }
  @Patch('admin/cell-groups/:contextId/attendance-sessions/:id')
  @RequirePermissions('cell_groups:update')
  updateCellGroup(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneralAttendanceCountsDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendance.updateSession(
      'cell_group',
      contextId,
      id,
      dto,
      req.profile!.church_id,
      user.id ?? user.sub,
      req.profile,
    );
  }
}
