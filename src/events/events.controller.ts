/**
 * @file events.controller.ts
 * @description HTTP endpoints for event management, registration, and ticketing.
 *
 * Provides event CRUD, member registration (free and paid), ticket validation,
 * multi-tier pricing, and payment webhook handling.
 *
 * @module events/events.controller
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
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser, SupabaseUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import {
  ApiCreateEndpoint,
  ApiGetEndpoint,
  ApiUpdateEndpoint,
  ApiDeleteEndpoint,
  ApiListEndpoint,
} from '../common/decorators/api-standard-responses.decorator';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { RegisterForEventDto } from './dto/register-for-event.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';
import { TicketValidationResponseDto } from './dto/ticket-validation-response.dto';
import { CreateTicketTierDto } from './dto/create-ticket-tier.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { BulkCheckInDto, WalkInCheckInDto } from './dto/check-in.dto';
import { AttendanceResponseDto } from '../attendance/dto/attendance-response.dto';

/**
 * Controller for event management, registration, and ticketing.
 */
@ApiTags('Events')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ─── EVENT CRUD ────────────────────────────────────────────────

  /**
   * Creates a new event.
   *
   * @param dto - Event creation data
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Created event response
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:create')
  @ApiCreateEndpoint('Create a new event', 'Creates a new church event.')
  async createEvent(
    @Body() dto: CreateEventDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<EventResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.createEvent(dto, churchId, user.sub);
  }
  /**
   * Lists events with pagination and filters.
   *
   * @param dto - Query parameters for pagination and filtering
   * @param req - HTTP request with profile context
   * @returns Paginated list of events
   */
  @Get()
  @ApiPaginatedResponse(EventResponseDto)
  @ApiOperation({
    summary: 'List events',
    description: 'List church events with pagination and filters.',
  })
  async listEvents(
    @Query() dto: ListEventsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ data: EventResponseDto[]; total: number }> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.listEvents(dto, churchId);
  }

  // ─── MANAGEMENT ──────────────────────────────────────────────

  /**
   * Lists all tickets across events (management view).
   *
   * @param eventId - Optional filter by event UUID
   * @param status - Optional filter by ticket status
   * @param search - Optional search by ticket code or member name
   * @param req - HTTP request with profile context
   * @returns Paginated list of tickets with event and member details
   */
  @Get('management/tickets')
  @ApiOperation({
    summary: 'List all tickets',
    description: 'Lists all tickets across events for management purposes.',
  })
  async listAllTickets(
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    const churchId = req?.profile?.church_id || '';
    return this.eventsService.listAllTickets(churchId, {
      eventId,
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
    });
  }

  /**
   * Gets a single event by ID with tier details.
   *
   * @param eventId - Event UUID
   * @param req - HTTP request with profile context
   * @returns Event response with ticket tiers
   */
  @Get(':eventId')
  @ApiGetEndpoint('Get event details')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async getEvent(
    @Param('eventId') eventId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<EventResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.getEvent(eventId, churchId);
  }

  /**
   * Updates an event.
   *
   * @param eventId - Event UUID
   * @param dto - Update data
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Updated event response
   */
  @Patch(':eventId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @ApiUpdateEndpoint('Update event details')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<EventResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.updateEvent(eventId, dto, churchId, user.sub);
  }

  /**
   * Deletes an event. Blocked if registrations exist.
   *
   * @param eventId - Event UUID
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   */
  @Delete(':eventId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
  @RequirePermissions('events:delete')
  @ApiDeleteEndpoint('Delete an event')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async deleteEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.deleteEvent(eventId, churchId, user.sub);
  }

  // ─── TICKET TIERS ──────────────────────────────────────────────

  /**
   * Creates a ticket tier for a paid event.
   *
   * @param eventId - Event UUID
   * @param dto - Tier creation data (name, price, optional capacity)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Created tier ID
   */
  @Post(':eventId/tiers')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateEndpoint('Create a ticket tier', 'Creates a pricing tier for a paid event.')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async createTicketTier(
    @Param('eventId') eventId: string,
    @Body() dto: CreateTicketTierDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ tierId: string }> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.createTicketTier(
      eventId,
      dto.name,
      dto.price,
      churchId,
      user.sub,
      dto.capacity,
      dto.description,
    );
  }

  /**
   * Lists all ticket tiers for an event.
   *
   * @param eventId - Event UUID
   * @param req - HTTP request with profile context
   * @returns Array of ticket tiers
   */
  @Get(':eventId/tiers')
  @ApiListEndpoint('List event ticket tiers', 'Lists all pricing tiers for an event.')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async listTicketTiers(@Param('eventId') eventId: string, @Request() req: AuthenticatedRequest) {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.listTicketTiers(eventId, churchId);
  }

  /**
   * Updates a ticket tier.
   *
   * @param eventId - Event UUID
   * @param tierId - Tier UUID
   * @param dto - Update data
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Updated tier
   */
  @Patch(':eventId/tiers/:tierId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:update')
  @ApiUpdateEndpoint('Update a ticket tier')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'tierId', description: 'Tier UUID' })
  async updateTicketTier(
    @Param('eventId') eventId: string,
    @Param('tierId') tierId: string,
    @Body()
    dto: {
      name?: string;
      price?: number;
      capacity?: number | null;
      description?: string | null;
      displayOrder?: number;
    },
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.updateTicketTier(eventId, tierId, dto, churchId, user.sub);
  }

  /**
   * Deletes a ticket tier. Blocked if registrations reference it.
   *
   * @param eventId - Event UUID
   * @param tierId - Tier UUID
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   */
  @Delete(':eventId/tiers/:tierId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:delete')
  @ApiDeleteEndpoint('Delete a ticket tier')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'tierId', description: 'Tier UUID' })
  async deleteTicketTier(
    @Param('eventId') eventId: string,
    @Param('tierId') tierId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.deleteTicketTier(eventId, tierId, churchId, user.sub);
  }

  // ─── REGISTRATION ──────────────────────────────────────────────

  /**
   * Registers a member for an event.
   *
   * Free events: immediate registration + ticket generation.
   * Paid events: returns payment authorization URL for frontend redirect.
   *
   * @param eventId - Event UUID
   * @param dto - Registration data (memberId, customData, tierId, quantity)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Registration response (with authorizationUrl for paid events)
   */
  @Post(':eventId/register')
  @ApiCreateEndpoint('Register for an event', 'Registers a member for an event.')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async registerForEvent(
    @Param('eventId') eventId: string,
    @Body() dto: RegisterForEventDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<RegistrationResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.registerForEvent(
      eventId,
      dto.memberId,
      dto.customData,
      churchId,
      user.sub,
      dto.tierId,
      dto.quantity,
    );
  }

  /**
   * Lists registrations for an event with payment details.
   *
   * @param eventId - Event UUID
   * @param req - HTTP request with profile context
   * @returns Array of registration responses
   */
  @Get(':eventId/registrations')
  @ApiListEndpoint('List event registrations', 'Lists all registrations for an event.')
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async listRegistrations(
    @Param('eventId') eventId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<RegistrationResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.listRegistrations(eventId, churchId);
  }

  /**
   * Cancels a member's registration for an event.
   *
   * @param eventId - Event UUID
   * @param memberId - Member UUID
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   */
  @Delete(':eventId/register/:memberId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:update')
  @ApiOperation({
    summary: 'Cancel registration',
    description: "Cancels a member's registration for an event.",
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'memberId', description: 'Member UUID' })
  async cancelRegistration(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.cancelRegistration(eventId, memberId, churchId, user.sub);
  }

  // ─── TICKET CREATION & VALIDATION ────────────────────────────────

  /**
   * Manually creates a ticket for an event (admin-initiated).
   *
   * @param eventId - Event UUID
   * @param dto - Ticket creation data (memberId, optional tierId)
   * @param user - Authenticated Supabase user
   * @param req - HTTP request with profile context
   * @returns Created ticket details
   */
  @Post(':eventId/tickets')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a ticket',
    description:
      'Manually creates a ticket for a member or visitor. Used for walk-in purchases, comp tickets, or admin ticket creation.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async createTicket(
    @Param('eventId') eventId: string,
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!dto.memberId && !dto.visitorId) {
      throw new BadRequestException('At least one of memberId or visitorId must be provided');
    }
    const churchId = req.profile?.church_id || '';
    return this.eventsService.createTicket(
      eventId,
      dto.memberId,
      dto.visitorId,
      dto.tierId,
      churchId,
      user.sub,
    );
  }

  /**
   * Validates a ticket code at event check-in.
   *
   * @param eventId - Event UUID
   * @param body - Ticket code to validate
   * @param req - HTTP request with profile context
   * @returns Validation result with attendee details
   */
  @Post(':eventId/tickets/validate')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor', 'secretary')
  @ApiOperation({
    summary: 'Validate ticket',
    description: 'Validates a ticket code for event check-in.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async validateTicket(
    @Param('eventId') eventId: string,
    @Body('code') code: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TicketValidationResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.validateTicket(code, eventId, churchId);
  }

  // ─── EVENT CHECK-IN ────────────────────────────────────────────

  @Post(':eventId/check-in')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bulk check-in attendees',
    description: 'Checks in multiple members for an event at once.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async bulkCheckIn(
    @Param('eventId') eventId: string,
    @Body() dto: BulkCheckInDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ checkedIn: number; skipped: number }> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.bulkCheckInAttendees(eventId, dto.memberIds, churchId, user.sub);
  }

  @Post(':eventId/check-in/walk-in')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
  @RequirePermissions('events:update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Walk-in check-in',
    description: 'Checks in a walk-in attendee, creating a member record if needed.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async walkInCheckIn(
    @Param('eventId') eventId: string,
    @Body() dto: WalkInCheckInDto,
    @CurrentUser() user: SupabaseUser,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttendanceResponseDto> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.walkInCheckIn(eventId, dto, churchId, user.sub);
  }

  @Get(':eventId/attendance')
  @ApiOperation({
    summary: 'List event attendance',
    description: 'Returns all attendance records for an event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  async getEventAttendance(
    @Param('eventId') eventId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<AttendanceResponseDto[]> {
    const churchId = req.profile?.church_id || '';
    return this.eventsService.getEventAttendance(eventId, churchId);
  }
}
