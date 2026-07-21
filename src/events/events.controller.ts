/**
 * @file events.controller.ts
 * @description HTTP endpoints for event management and registration.
 *
 * Provides event CRUD, member registration, and registration listing.
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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireRoles } from '../auth/decorators/roles.decorator';
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

/**
 * Controller for event management and registration.
 */
@ApiTags('Events')
@ApiBearerAuth('supabase-auth')
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ─── EVENT CRUD ────────────────────────────────────────────────

  /**
   * Create a new event.
   */
  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin', 'branch_pastor')
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
   * List events with pagination and filters.
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

  /**
   * Get a single event by ID.
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
   * Update an event.
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
   * Delete an event.
   */
  @Delete(':eventId')
  @UseGuards(RolesGuard)
  @RequireRoles('church_admin')
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

  // ─── REGISTRATION ──────────────────────────────────────────────

  /**
   * Register a member for an event.
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
    );
  }

  /**
   * List registrations for an event.
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
}
