/**
 * @file pastoral.controller.ts
 * @description HTTP endpoints for pastoral note management.
 *
 * Provides REST endpoints for pastoral notes CRUD with AES-256-GCM
 * encrypted storage and confidentiality-based access control.
 *
 * All endpoints require JWT authentication. Write operations are
 * restricted to pastors and admin roles.
 *
 * @module pastoral/pastoral.controller
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
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { PastoralService } from './pastoral.service';
import { ScoringService } from './scoring.service';
import { CreatePastoralNoteDto } from './dto/create-pastoral-note.dto';
import { UpdatePastoralNoteDto } from './dto/update-pastoral-note.dto';
import { ListPastoralNotesDto } from './dto/list-pastoral-notes.dto';
import { PastoralNoteResponseDto } from './dto/pastoral-note-response.dto';
import { CreateLifeEventDto } from './dto/create-life-event.dto';
import { ListLifeEventsDto } from './dto/list-life-events.dto';
import { LifeEventResponseDto } from './dto/life-event-response.dto';
import { ListRiskScoresDto } from './dto/list-risk-scores.dto';
import { ListEngagementScoresDto } from './dto/list-engagement-scores.dto';
import { RiskScoreResponseDto } from './dto/risk-score-response.dto';
import { EngagementScoreResponseDto } from './dto/engagement-score-response.dto';

@ApiTags('Pastoral')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pastoral')
export class PastoralController {
  constructor(
    // Inject PastoralService for business logic delegation
    private readonly pastoralService: PastoralService,
    // Inject ScoringService for risk/engagement score queries
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Creates a new pastoral note with encrypted content.
   *
   * @param dto - Note creation data
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Created pastoral note
   */
  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:create')
  @ApiOperation({ summary: 'Create a new pastoral note' })
  async createNote(
    @Body() dto: CreatePastoralNoteDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<PastoralNoteResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate note creation to the pastoral service
    return this.pastoralService.createNote(dto, churchId, user.sub);
  }

  /**
   * Lists pastoral notes with pagination and filters.
   *
   * Confidentiality levels are enforced based on user role.
   *
   * @param query - List/filter parameters
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Paginated list of pastoral notes
   */
  @Get('notes')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiPaginatedResponse(PastoralNoteResponseDto)
  @ApiOperation({ summary: 'List pastoral notes with filters' })
  async listNotes(
    @Query() query: ListPastoralNotesDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ) {
    // Extract church ID and user role from the authenticated profile
    const churchId = req.profile?.church_id || '';
    const role = req.profile?.role || '';
    // Delegate the listing to the pastoral service with role-based filtering
    return this.pastoralService.listNotes(query, churchId, role, user.sub);
  }

  /**
   * Gets a single pastoral note by ID.
   *
   * @param noteId - Pastoral note ID
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Pastoral note with decrypted content
   */
  @Get('notes/:noteId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiParam({ name: 'noteId', type: String })
  @ApiOperation({ summary: 'Get a pastoral note by ID' })
  async getNoteById(
    @Param('noteId') noteId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<PastoralNoteResponseDto> {
    // Extract church ID and user role from the authenticated profile
    const churchId = req.profile?.church_id || '';
    const role = req.profile?.role || '';
    // Delegate the lookup to the pastoral service
    return this.pastoralService.getNoteById(noteId, churchId, role, user.sub);
  }

  /**
   * Updates a pastoral note. Only the author or admin can update.
   *
   * @param noteId - Pastoral note ID
   * @param dto - Update data
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Updated pastoral note
   */
  @Patch('notes/:noteId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:update')
  @ApiParam({ name: 'noteId', type: String })
  @ApiOperation({ summary: 'Update a pastoral note' })
  async updateNote(
    @Param('noteId') noteId: string,
    @Body() dto: UpdatePastoralNoteDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<PastoralNoteResponseDto> {
    // Extract church ID and user role from the authenticated profile
    const churchId = req.profile?.church_id || '';
    const role = req.profile?.role || '';
    // Delegate the update to the pastoral service with ownership check
    return this.pastoralService.updateNote(noteId, dto, churchId, user.sub, role);
  }

  /**
   * Deletes a pastoral note. Restricted notes require admin/senior pastor.
   *
   * @param noteId - Pastoral note ID
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   */
  @Delete('notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor')
  @RequirePermissions('pastoral:delete')
  @ApiParam({ name: 'noteId', type: String })
  @ApiOperation({ summary: 'Delete a pastoral note' })
  async deleteNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract church ID and user role from the authenticated profile
    const churchId = req.profile?.church_id || '';
    const role = req.profile?.role || '';
    // Delegate the deletion to the pastoral service with authorization check
    return this.pastoralService.deleteNote(noteId, churchId, user.sub, role);
  }

  /**
   * Archives a pastoral note. Archived notes drop out of active lists.
   *
   * @param noteId - Pastoral note ID
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Archived pastoral note
   */
  @Post('notes/:noteId/archive')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:update')
  @ApiParam({ name: 'noteId', type: String })
  @ApiOperation({ summary: 'Archive a pastoral note' })
  async archiveNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<PastoralNoteResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the archive to the pastoral service
    return this.pastoralService.archiveNote(noteId, churchId, user.sub);
  }

  /**
   * Restores an archived pastoral note.
   *
   * @param noteId - Pastoral note ID
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Restored pastoral note
   */
  @Post('notes/:noteId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:update')
  @ApiParam({ name: 'noteId', type: String })
  @ApiOperation({ summary: 'Restore an archived pastoral note' })
  async restoreNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<PastoralNoteResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the restore to the pastoral service
    return this.pastoralService.restoreNote(noteId, churchId, user.sub);
  }

  // ─── Life Events ──────────────────────────────────────────

  /**
   * Creates a new life event record.
   *
   * @param dto - Life event creation data
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   * @returns Created life event
   */
  @Post('life-events')
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:create')
  @ApiOperation({ summary: 'Create a new life event' })
  async createLifeEvent(
    @Body() dto: CreateLifeEventDto,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<LifeEventResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate life event creation to the pastoral service
    return this.pastoralService.createLifeEvent(dto, churchId, user.sub);
  }

  /**
   * Lists life events with pagination and filters.
   *
   * @param query - List/filter parameters
   * @param req - Authenticated request with profile
   * @returns Paginated list of life events
   */
  @Get('life-events')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiPaginatedResponse(LifeEventResponseDto)
  @ApiOperation({ summary: 'List life events with filters' })
  async listLifeEvents(@Query() query: ListLifeEventsDto, @Req() req: AuthenticatedRequest) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the listing to the pastoral service
    return this.pastoralService.listLifeEvents(query, churchId);
  }

  /**
   * Gets upcoming life events for the next N days.
   *
   * @param daysAhead - Number of days to look ahead
   * @param req - Authenticated request with profile
   * @returns Upcoming life events
   */
  @Get('life-events/upcoming')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiOperation({ summary: 'Get upcoming life events' })
  async getUpcomingLifeEvents(
    @Query('daysAhead') daysAhead: number,
    @Req() req: AuthenticatedRequest,
  ) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the query to the pastoral service with default 30-day lookahead
    return this.pastoralService.getUpcomingLifeEvents(churchId, daysAhead || 30);
  }

  /**
   * Gets a single life event by ID.
   *
   * @param eventId - Life event ID
   * @param req - Authenticated request with profile
   * @returns Life event data
   */
  @Get('life-events/:eventId')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiParam({ name: 'eventId', type: String })
  @ApiOperation({ summary: 'Get a life event by ID' })
  async getLifeEventById(
    @Param('eventId') eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LifeEventResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the lookup to the pastoral service
    return this.pastoralService.getLifeEventById(eventId, churchId);
  }

  /**
   * Deletes a life event.
   *
   * @param eventId - Life event ID
   * @param user - Authenticated user
   * @param req - Authenticated request with profile
   */
  @Delete('life-events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRoles('church_admin', 'senior_pastor')
  @RequirePermissions('pastoral:delete')
  @ApiParam({ name: 'eventId', type: String })
  @ApiOperation({ summary: 'Delete a life event' })
  async deleteLifeEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the deletion to the pastoral service
    return this.pastoralService.deleteLifeEvent(eventId, churchId, user.sub);
  }

  /**
   * Archives a life event. Archived events drop out of active lists.
   *
   * @param eventId - Life event ID
   * @param req - Authenticated request with profile
   * @returns Archived life event
   */
  @Post('life-events/:lifeEventId/archive')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:update')
  @ApiParam({ name: 'lifeEventId', type: String })
  @ApiOperation({ summary: 'Archive a life event' })
  async archiveLifeEvent(
    @Param('lifeEventId') eventId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<LifeEventResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the archive to the pastoral service
    return this.pastoralService.archiveLifeEvent(eventId, churchId, user.sub);
  }

  /**
   * Restores an archived life event.
   *
   * @param eventId - Life event ID
   * @param req - Authenticated request with profile
   * @returns Restored life event
   */
  @Post('life-events/:lifeEventId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:update')
  @ApiParam({ name: 'lifeEventId', type: String })
  @ApiOperation({ summary: 'Restore an archived life event' })
  async restoreLifeEvent(
    @Param('lifeEventId') eventId: string,
    @CurrentUser() user: SupabaseUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<LifeEventResponseDto> {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the restore to the pastoral service
    return this.pastoralService.restoreLifeEvent(eventId, churchId, user.sub);
  }

  // ─── Risk & Engagement Scoring ───────────────────────────

  /**
   * Lists risk scores across all members with pagination.
   *
   * @param query - List/filter/sort DTO
   * @param req - Authenticated request with profile
   * @returns Paginated risk scores
   */
  @Get('risk-scores')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiPaginatedResponse(RiskScoreResponseDto)
  @ApiOperation({ summary: 'List member risk scores' })
  async listRiskScores(@Query() query: ListRiskScoresDto, @Req() req: AuthenticatedRequest) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the query to the scoring service
    return this.scoringService.listRiskScores(churchId, query);
  }

  /**
   * Lists engagement scores across all members with pagination.
   *
   * @param query - List/filter/sort DTO
   * @param req - Authenticated request with profile
   * @returns Paginated engagement scores
   */
  @Get('engagement-scores')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiPaginatedResponse(EngagementScoreResponseDto)
  @ApiOperation({ summary: 'List member engagement scores' })
  async listEngagementScores(
    @Query() query: ListEngagementScoresDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the query to the scoring service
    return this.scoringService.listEngagementScores(churchId, query);
  }

  /**
   * Gets the church-wide engagement score distribution.
   *
   * @param req - Authenticated request with profile
   * @returns Distribution counts by engagement bucket
   */
  @Get('engagement/summary')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiOperation({ summary: 'Get engagement score distribution' })
  async getEngagementDistribution(@Req() req: AuthenticatedRequest) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the query to the scoring service
    return this.scoringService.getEngagementDistribution(churchId);
  }

  /**
   * Gets a member's combined risk + engagement scores with follow-up suggestions.
   *
   * @param memberId - Member ID
   * @param req - Authenticated request with profile
   * @returns Member risk/engagement scores and suggestions
   */
  @Get('members/:memberId/scoring')
  @RequireRoles('church_admin', 'senior_pastor', 'branch_pastor', 'secretary')
  @RequirePermissions('pastoral:read')
  @ApiParam({ name: 'memberId', type: String })
  @ApiOperation({ summary: 'Get member risk + engagement scores' })
  async getMemberScoring(@Param('memberId') memberId: string, @Req() req: AuthenticatedRequest) {
    // Extract the church ID from the authenticated user's profile
    const churchId = req.profile?.church_id || '';
    // Delegate the query to the scoring service
    return this.scoringService.getMemberScoring(memberId, churchId);
  }
}
