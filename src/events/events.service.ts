/**
 * @file events.service.ts
 * @description Business logic for event management and registration.
 *
 * Handles event CRUD, member registration, capacity checks, and ticket
 * generation. All queries are scoped by church_id for multi-tenant isolation.
 *
 * @module events/events.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { Prisma } from '@prisma/client';

/**
 * Service for managing church events.
 * Provides event CRUD, registration management, and capacity tracking.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  // ─── EVENT CRUD ────────────────────────────────────────────────

  /**
   * Creates a new event.
   */
  async createEvent(
    dto: CreateEventDto,
    churchId: string,
    userId: string,
  ): Promise<EventResponseDto> {
    const event = await this.prisma.event.create({
      data: {
        church_id: churchId,
        branch_id: dto.branchId || null,
        title: dto.title,
        description: dto.description,
        type: (dto.type as never) || 'service',
        start_date: new Date(dto.startDate),
        end_date: dto.endDate ? new Date(dto.endDate) : null,
        location: dto.location,
        capacity: dto.capacity,
        is_free: dto.isFree ?? true,
        price: dto.price,
        registration_fields: (dto.registrationFields ?? []) as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event',
      action: 'CREATE',
      entityId: event.id,
      newValues: { title: dto.title, type: dto.type },
    });

    this.logger.log(`Event created: ${event.id} (${dto.title})`);
    return this.mapEventToDto(event, 0);
  }

  /**
   * Lists events for a church with pagination and filters.
   */
  async listEvents(
    dto: ListEventsDto,
    churchId: string,
  ): Promise<{ data: EventResponseDto[]; total: number }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      church_id: churchId,
    };

    if (dto.branchId) {
      where.branch_id = dto.branchId;
    }

    if (dto.type) {
      where.type = dto.type as never;
    }

    if (dto.search) {
      where.OR = [
        { title: { contains: dto.search, mode: 'insensitive' } },
        { description: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    // Date filters
    const now = new Date();
    if (dto.dateFilter === 'upcoming') {
      where.start_date = { gte: now };
    } else if (dto.dateFilter === 'past') {
      where.start_date = { lt: now };
    }

    if (dto.startDate) {
      where.start_date = {
        ...(where.start_date as Prisma.DateTimeFilter),
        gte: new Date(dto.startDate),
      };
    }
    if (dto.endDate) {
      where.start_date = {
        ...(where.start_date as Prisma.DateTimeFilter),
        lte: new Date(dto.endDate),
      };
    }

    const orderBy: Prisma.EventOrderByWithRelationInput =
      dto.sortBy === 'title'
        ? { title: dto.sortOrder ?? 'asc' }
        : dto.sortBy === 'created_at'
          ? { created_at: dto.sortOrder ?? 'desc' }
          : { start_date: dto.sortOrder ?? 'asc' };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { _count: { select: { registrations: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events.map((e) => this.mapEventToDto(e, e._count.registrations)),
      total,
    };
  }

  /**
   * Gets a single event by ID.
   */
  async getEvent(eventId: string, churchId: string): Promise<EventResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!event) {
      throw new NotFoundException(`Event not found`);
    }

    return this.mapEventToDto(event, event._count.registrations);
  }

  /**
   * Updates an event.
   */
  async updateEvent(
    eventId: string,
    dto: UpdateEventDto,
    churchId: string,
    userId: string,
  ): Promise<EventResponseDto> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!existing) {
      throw new NotFoundException(`Event not found`);
    }

    const data: Prisma.EventUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type as never;
    if (dto.startDate !== undefined) data.start_date = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.end_date = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.isFree !== undefined) data.is_free = dto.isFree;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.branchId !== undefined)
      data.branch = dto.branchId ? { connect: { id: dto.branchId } } : { disconnect: true };
    if (dto.registrationFields !== undefined)
      data.registration_fields = dto.registrationFields as unknown as Prisma.InputJsonValue;

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data,
      include: { _count: { select: { registrations: true } } },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event',
      action: 'UPDATE',
      entityId: eventId,
      newValues: dto as unknown as Record<string, unknown>,
    });

    this.logger.log(`Event updated: ${eventId}`);
    return this.mapEventToDto(updated, updated._count.registrations);
  }

  /**
   * Deletes (soft-check) an event. Hard delete if no registrations exist.
   */
  async deleteEvent(eventId: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!existing) {
      throw new NotFoundException(`Event not found`);
    }

    // Block deletion if registrations exist
    if (existing._count.registrations > 0) {
      throw new BadRequestException(
        `Cannot delete event with ${existing._count.registrations} registration(s). Cancel registrations first.`,
      );
    }

    await this.prisma.event.delete({ where: { id: eventId } });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event',
      action: 'DELETE',
      entityId: eventId,
      oldValues: { title: existing.title },
    });

    this.logger.log(`Event deleted: ${eventId}`);
  }

  // ─── REGISTRATION ──────────────────────────────────────────────

  /**
   * Registers a member for an event.
   * Checks for duplicates and capacity limits.
   */
  async registerForEvent(
    eventId: string,
    memberId: string,
    customData: Record<string, unknown> | undefined,
    churchId: string,
    userId: string,
  ): Promise<RegistrationResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!event) {
      throw new NotFoundException(`Event not found`);
    }

    // Check for duplicate registration
    const existingRegistration = await this.prisma.eventRegistration.findUnique({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
    });

    if (existingRegistration) {
      throw new ConflictException(`Member is already registered for this event`);
    }

    // Check capacity
    if (event.capacity && event._count.registrations >= event.capacity) {
      throw new BadRequestException(`Event has reached its maximum capacity of ${event.capacity}`);
    }

    // Verify member exists in same church
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, church_id: churchId },
    });

    if (!member) {
      throw new NotFoundException(`Member not found`);
    }

    const registration = await this.prisma.eventRegistration.create({
      data: {
        event_id: eventId,
        member_id: memberId,
        custom_data: (customData ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event_registration',
      action: 'CREATE',
      entityId: registration.id,
      newValues: { event_id: eventId, member_id: memberId },
    });

    this.logger.log(`Event registration: member ${memberId} → event ${eventId}`);
    return this.mapRegistrationToDto(registration);
  }

  /**
   * Lists registrations for an event.
   */
  async listRegistrations(eventId: string, churchId: string): Promise<RegistrationResponseDto[]> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!event) {
      throw new NotFoundException(`Event not found`);
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { event_id: eventId },
      orderBy: { created_at: 'desc' },
    });

    return registrations.map((r) => this.mapRegistrationToDto(r));
  }

  /**
   * Cancels a registration.
   */
  async cancelRegistration(
    eventId: string,
    memberId: string,
    churchId: string,
    userId: string,
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!event) {
      throw new NotFoundException(`Event not found`);
    }

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
    });

    if (!registration) {
      throw new NotFoundException(`Registration not found`);
    }

    await this.prisma.eventRegistration.delete({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event_registration',
      action: 'DELETE',
      entityId: registration.id,
      oldValues: { event_id: eventId, member_id: memberId },
    });

    this.logger.log(`Registration cancelled: member ${memberId} ← event ${eventId}`);
  }

  // ─── MAPPERS ───────────────────────────────────────────────────

  /**
   * Maps a Prisma Event to EventResponseDto.
   */
  private mapEventToDto(
    event: Record<string, unknown> & {
      id: string;
      start_date: Date;
      created_at: Date;
      updated_at: Date;
    },
    registrationCount: number,
  ): EventResponseDto {
    return {
      eventId: event.id,
      churchId: event.church_id as string,
      branchId: (event.branch_id as string) || undefined,
      title: event.title as string,
      description: (event.description as string) || undefined,
      type: event.type as string,
      startDate: event.start_date.toISOString(),
      endDate: event.end_date ? (event.end_date as Date).toISOString() : undefined,
      location: (event.location as string) || undefined,
      capacity: (event.capacity as number) || undefined,
      isFree: event.is_free as boolean,
      price: (event.price as number) || undefined,
      registrationCount,
      createdAt: event.created_at.toISOString(),
      updatedAt: event.updated_at.toISOString(),
    };
  }

  /**
   * Maps a Prisma EventRegistration to RegistrationResponseDto.
   */
  private mapRegistrationToDto(
    registration: Record<string, unknown> & { id: string; created_at: Date },
  ): RegistrationResponseDto {
    return {
      registrationId: registration.id,
      eventId: registration.event_id as string,
      memberId: registration.member_id as string,
      customData: (registration.custom_data as Record<string, unknown>) || undefined,
      createdAt: registration.created_at.toISOString(),
    };
  }
}
