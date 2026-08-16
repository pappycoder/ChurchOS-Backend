/**
 * @file events.service.ts
 * @description Business logic for event management, registration, and ticketing.
 *
 * Handles event CRUD, member registration (free and paid), capacity checks,
 * multi-tier ticket pricing, ticket generation, payment confirmation via
 * webhooks, and event-day ticket validation (check-in).
 *
 * Free events: immediate registration + ticket generation.
 * Paid events: pending registration → payment initialization → webhook
 * confirmation → ticket generation.
 *
 * All queries are scoped by church_id for multi-tenant isolation.
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
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PaymentGatewayProvider,
  PAYMENT_GATEWAY_REGISTRY,
} from '../giving/services/payment-gateway.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { RegistrationResponseDto } from './dto/registration-response.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Service for managing church events.
 * Provides event CRUD, registration management, paid ticketing,
 * multi-tier pricing, and ticket validation.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
    @Inject(PAYMENT_GATEWAY_REGISTRY)
    private readonly gatewayRegistry: Map<string, PaymentGatewayProvider>,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── EVENT CRUD ────────────────────────────────────────────────

  /**
   * Creates a new event.
   *
   * @param dto - Event creation data
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user creating the event (for audit)
   * @returns Created event response
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
   *
   * @param dto - List query parameters (pagination, filters, sorting)
   * @param churchId - Church ID for tenant scoping
   * @returns Paginated list of events with registration counts
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
   * Gets a single event by ID with tier details.
   *
   * @param eventId - Event UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Event response with registration count and ticket tiers
   * @throws NotFoundException if event doesn't exist
   */
  async getEvent(eventId: string, churchId: string): Promise<EventResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: {
        _count: { select: { registrations: true } },
        ticket_tiers: { orderBy: { display_order: 'asc' } },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.mapEventToDto(event, event._count.registrations);
  }

  /**
   * Updates an event.
   *
   * @param eventId - Event UUID to update
   * @param dto - Update data (all fields optional)
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the update (for audit)
   * @returns Updated event response
   * @throws NotFoundException if event doesn't exist
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
      throw new NotFoundException('Event not found');
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
   * Deletes an event. Blocked if registrations exist.
   *
   * @param eventId - Event UUID to delete
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the deletion (for audit)
   * @throws NotFoundException if event doesn't exist
   * @throws BadRequestException if event has registrations
   */
  async deleteEvent(eventId: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: { _count: { select: { registrations: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Event not found');
    }

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

  // ─── TICKET TIERS ──────────────────────────────────────────────

  /**
   * Creates a ticket tier for an event.
   *
   * @param eventId - Event UUID
   * @param name - Tier name (e.g. "VIP", "General")
   * @param price - Price in Naira
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user creating the tier (for audit)
   * @param capacity - Optional per-tier capacity limit
   * @param description - Optional tier description
   * @returns Created tier ID
   * @throws NotFoundException if event doesn't exist
   */
  async createTicketTier(
    eventId: string,
    name: string,
    price: number,
    churchId: string,
    userId: string,
    capacity?: number,
    description?: string,
  ): Promise<{ tierId: string }> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const maxOrder = await this.prisma.eventTicketTier.aggregate({
      where: { event_id: eventId },
      _max: { display_order: true },
    });

    const tier = await this.prisma.eventTicketTier.create({
      data: {
        event_id: eventId,
        name,
        price,
        capacity,
        description,
        display_order: (maxOrder._max.display_order ?? -1) + 1,
      },
    });

    await this.audit.log({
      userId,
      churchId,
      entity: 'event_ticket_tier',
      action: 'CREATE',
      entityId: tier.id,
      newValues: { event_id: eventId, name, price },
    });

    this.logger.log(`Ticket tier created: ${tier.id} (${name}) for event ${eventId}`);
    return { tierId: tier.id };
  }

  // ─── REGISTRATION ──────────────────────────────────────────────

  /**
   * Registers a member for an event.
   *
   * Free events: immediate registration + ticket generation.
   * Paid events: creates a pending registration and returns payment
   * authorization details for frontend redirect.
   *
   * @param eventId - Event UUID
   * @param memberId - Member UUID
   * @param customData - Optional custom registration field values
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing registration (for audit)
   * @param tierId - Optional ticket tier ID for paid events
   * @param quantity - Number of tickets (default: 1)
   * @returns Registration response (free) or payment init response (paid)
   * @throws NotFoundException if event or member doesn't exist
   * @throws ConflictException if member is already registered
   * @throws BadRequestException if event is at capacity
   */
  async registerForEvent(
    eventId: string,
    memberId: string,
    customData: Record<string, unknown> | undefined,
    churchId: string,
    userId: string,
    tierId?: string,
    quantity: number = 1,
  ): Promise<RegistrationResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
      include: {
        _count: { select: { registrations: true } },
        ticket_tiers: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Duplicate check
    const existingRegistration = await this.prisma.eventRegistration.findUnique({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
    });

    if (existingRegistration) {
      throw new ConflictException('Member is already registered for this event');
    }

    // Capacity check (event-level)
    if (event.capacity && event._count.registrations >= event.capacity) {
      throw new BadRequestException(`Event has reached its maximum capacity of ${event.capacity}`);
    }

    // Verify member exists in same church
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, church_id: churchId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Resolve tier for paid events
    let tier: (typeof event.ticket_tiers)[number] | undefined;
    if (!event.is_free) {
      if (tierId) {
        tier = event.ticket_tiers.find((t) => t.id === tierId);
        if (!tier) {
          throw new NotFoundException('Ticket tier not found');
        }
      } else if (event.ticket_tiers.length > 0) {
        // Default to first tier (display_order 0)
        tier = event.ticket_tiers[0];
      }
    }

    // Free event: immediate registration + ticket
    if (event.is_free) {
      const registration = await this.prisma.eventRegistration.create({
        data: {
          church_id: churchId,
          event_id: eventId,
          member_id: memberId,
          custom_data: (customData ?? {}) as unknown as Prisma.InputJsonValue,
          payment_status: 'paid',
          quantity,
        },
      });

      const ticketCode = this.generateTicketCode();
      const ticket = await this.prisma.ticket.create({
        data: {
          event_id: eventId,
          code: ticketCode,
          member_id: memberId,
          registration_id: registration.id,
          status: 'paid',
          tier_name: tier?.name ?? 'General',
          price_paid: 0,
        },
      });

      await this.prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { ticket_id: ticket.id },
      });

      await this.audit.log({
        userId,
        churchId,
        entity: 'event_registration',
        action: 'CREATE',
        entityId: registration.id,
        newValues: { event_id: eventId, member_id: memberId, type: 'free' },
      });

      this.logger.log(`Free registration: member ${memberId} → event ${eventId}`);

      const adminProfiles = await this.prisma.profile.findMany({
        where: { church_id: churchId, role: { in: ['church_admin', 'branch_pastor'] } },
      });
      for (const admin of adminProfiles) {
        await this.notifications
          .createNotification(
            churchId,
            admin.id,
            'event',
            'Event Registration',
            `${member.first_name} ${member.last_name} registered for "${event.title}".`,
            { eventId, memberId, eventName: event.title },
          )
          .catch((err) => this.logger.warn(`Notification failed: ${(err as Error).message}`));
      }

      return this.mapRegistrationToDto({
        ...registration,
        ticket_code: ticketCode,
        tier_name: tier?.name,
      });
    }

    // Paid event: create pending registration + transaction
    const amount = (tier?.price ?? event.price ?? 0) * quantity;
    if (amount <= 0) {
      throw new BadRequestException('Event requires a valid ticket price');
    }

    // Tier capacity check
    if (tier?.capacity) {
      const tierRegistrations = await this.prisma.eventRegistration.count({
        where: { event_id: eventId, tier_id: tierId, payment_status: 'paid' },
      });
      if (tierRegistrations >= tier.capacity) {
        throw new BadRequestException(`Ticket tier "${tier.name}" has sold out`);
      }
    }

    const reference = this.generatePaymentReference(event.title);
    const memberEmail = (member as Record<string, unknown>).email as string | undefined;

    const registration = await this.prisma.eventRegistration.create({
      data: {
        church_id: churchId,
        event_id: eventId,
        member_id: memberId,
        custom_data: (customData ?? {}) as unknown as Prisma.InputJsonValue,
        payment_status: 'pending',
        payment_reference: reference,
        tier_id: tierId,
        quantity,
      },
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        church_id: churchId,
        member_id: memberId,
        amount,
        currency: 'NGN',
        type: 'digital',
        status: 'pending',
        payment_reference: reference,
        payment_gateway: 'paystack',
        notes: `Event ticket: ${event.title}${tier ? ` (${tier.name})` : ''} x${quantity}`,
        metadata: {
          event_id: eventId,
          registration_id: registration.id,
          tier_id: tierId,
          type: 'event_ticket',
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: { transaction_id: transaction.id },
    });

    // Initialize payment with gateway
    const gatewayName = 'paystack';
    const provider = this.gatewayRegistry.get(gatewayName);
    if (!provider || !provider.isConfigured()) {
      throw new BadRequestException('Payment gateway not configured');
    }

    const paymentResult = await provider.initializeTransaction(
      memberEmail || 'attendee@churchos.app',
      amount,
      reference,
      {
        event_id: eventId,
        registration_id: registration.id,
        tier_id: tierId,
        type: 'event_ticket',
      },
    );

    await this.audit.log({
      userId,
      churchId,
      entity: 'event_registration',
      action: 'CREATE',
      entityId: registration.id,
      newValues: {
        event_id: eventId,
        member_id: memberId,
        type: 'paid',
        amount,
        reference,
      },
    });

    this.logger.log(`Paid registration initialized: ${reference} for event ${eventId}`);

    return {
      registrationId: registration.id,
      eventId,
      memberId,
      customData: customData as Record<string, unknown> | undefined,
      paymentStatus: 'pending',
      authorizationUrl: paymentResult.authorizationUrl,
      paymentReference: reference,
      tierName: tier?.name,
      quantity,
      checkedIn: false,
      createdAt: registration.created_at.toISOString(),
    };
  }

  /**
   * Confirms a ticket payment after webhook verification.
   *
   * Called by the webhook handler after verifying the payment signature.
   * Updates registration payment status, generates ticket code, and
   * links the ticket to the registration.
   *
   * @param reference - Payment reference from the gateway
   * @param churchId - Church ID for tenant scoping
   * @returns Updated registration with ticket code
   * @throws NotFoundException if registration with this reference doesn't exist
   * @throws BadRequestException if registration is not in pending state
   */
  async confirmTicketPayment(reference: string): Promise<RegistrationResponseDto> {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { payment_reference: reference },
      include: { event: true },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found for this payment reference');
    }

    if (registration.payment_status === 'paid') {
      // Idempotent: already confirmed
      const existingTicket = registration.ticket_id
        ? await this.prisma.ticket.findUnique({ where: { id: registration.ticket_id } })
        : null;
      return this.mapRegistrationToDto({
        ...registration,
        ticket_code: existingTicket?.code,
        tier_name: existingTicket?.tier_name,
      });
    }

    if (registration.payment_status !== 'pending') {
      throw new BadRequestException(`Registration is in "${registration.payment_status}" state`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically claim the pending registration. A concurrent webhook sees a
      // zero count and returns the ticket created by the request that won.
      const claim = await tx.eventRegistration.updateMany({
        where: { id: registration.id, payment_status: 'pending' },
        data: { payment_status: 'paid' },
      });

      if (claim.count === 0) {
        const settled = await tx.eventRegistration.findUnique({ where: { id: registration.id } });
        const existingTicket = await tx.ticket.findFirst({
          where: { registration_id: registration.id },
        });

        if (settled?.payment_status === 'paid' && existingTicket) {
          return { ticket: existingTicket, alreadySettled: true };
        }

        throw new BadRequestException('Registration payment could not be settled');
      }

      const tier = registration.tier_id
        ? await tx.eventTicketTier.findUnique({ where: { id: registration.tier_id } })
        : null;
      const transaction = registration.transaction_id
        ? await tx.transaction.findUnique({ where: { id: registration.transaction_id } })
        : null;
      const ticketCode = this.generateTicketCode();
      const ticket = await tx.ticket.create({
        data: {
          event_id: registration.event_id,
          code: ticketCode,
          member_id: registration.member_id,
          registration_id: registration.id,
          status: 'paid',
          tier_name: tier?.name ?? 'General',
          price_paid: transaction?.amount ?? 0,
          transaction_id: registration.transaction_id,
          payment_reference: reference,
        },
      });

      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: { ticket_id: ticket.id },
      });

      if (registration.transaction_id) {
        await tx.transaction.update({
          where: { id: registration.transaction_id },
          data: { status: 'success' },
        });
      }

      return { ticket, alreadySettled: false, tierName: tier?.name };
    });

    if (result.alreadySettled) {
      return this.mapRegistrationToDto({
        ...registration,
        payment_status: 'paid',
        ticket_id: result.ticket.id,
        ticket_code: result.ticket.code,
        tier_name: result.ticket.tier_name,
      });
    }

    await this.audit.log({
      userId: registration.member_id,
      churchId: registration.event.church_id,
      entity: 'event_registration',
      action: 'UPDATE',
      entityId: registration.id,
      newValues: { payment_status: 'paid', ticket_code: result.ticket.code },
    });

    this.logger.log(`Ticket payment confirmed: ${reference} → ticket ${result.ticket.code}`);

    return this.mapRegistrationToDto({
      ...registration,
      payment_status: 'paid',
      ticket_id: result.ticket.id,
      ticket_code: result.ticket.code,
      tier_name: result.tierName,
    });
  }

  /**
   * Validates a ticket code for event check-in.
   *
   * @param code - Ticket code to validate
   * @param eventId - Event UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Validation result with attendee details
   * @throws NotFoundException if ticket or event doesn't exist
   * @throws BadRequestException if ticket is already used or cancelled
   */
  async validateTicket(
    code: string,
    eventId: string,
    churchId: string,
  ): Promise<{
    valid: boolean;
    memberName?: string;
    eventName?: string;
    tierName?: string;
    checkedInAt?: string;
  }> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: { code, event_id: eventId },
      include: {
        event: { select: { title: true } },
      },
    });

    if (!ticket) {
      return { valid: false };
    }

    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      return { valid: false };
    }

    if (ticket.is_used) {
      return {
        valid: false,
        memberName: ticket.member_id ?? undefined,
        eventName: ticket.event.title,
        tierName: ticket.tier_name ?? undefined,
        checkedInAt: ticket.used_at?.toISOString(),
      };
    }

    // Mark ticket as used
    const now = new Date();
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { is_used: true, used_at: now },
    });

    // Update registration check-in if linked
    if (ticket.registration_id) {
      await this.prisma.eventRegistration.update({
        where: { id: ticket.registration_id },
        data: { checked_in: true, checked_in_at: now },
      });
    }

    let memberName: string | undefined;
    if (ticket.member_id) {
      const member = await this.prisma.member.findUnique({
        where: { id: ticket.member_id },
        select: { first_name: true, last_name: true },
      });
      if (member) {
        memberName = `${member.first_name} ${member.last_name}`;
      }
    }

    this.logger.log(`Ticket validated: ${code} for event ${eventId}`);

    return {
      valid: true,
      memberName,
      eventName: ticket.event.title,
      tierName: ticket.tier_name ?? undefined,
      checkedInAt: now.toISOString(),
    };
  }

  /**
   * Lists registrations for an event with payment details.
   *
   * @param eventId - Event UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Array of registration responses
   * @throws NotFoundException if event doesn't exist
   */
  async listRegistrations(eventId: string, churchId: string): Promise<RegistrationResponseDto[]> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, church_id: churchId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { event_id: eventId },
      orderBy: { created_at: 'desc' },
    });

    return registrations.map((r) => this.mapRegistrationToDto(r));
  }

  /**
   * Cancels a registration. For paid events, marks ticket as cancelled.
   *
   * @param eventId - Event UUID
   * @param memberId - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the cancellation (for audit)
   * @throws NotFoundException if event or registration doesn't exist
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
      throw new NotFoundException('Event not found');
    }

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { event_id_member_id: { event_id: eventId, member_id: memberId } },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    // Cancel ticket if linked
    if (registration.ticket_id) {
      await this.prisma.ticket.update({
        where: { id: registration.ticket_id },
        data: { status: 'cancelled' },
      });
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
      oldValues: {
        event_id: eventId,
        member_id: memberId,
        payment_status: registration.payment_status,
      },
    });

    this.logger.log(`Registration cancelled: member ${memberId} ← event ${eventId}`);
  }

  // ─── HELPERS ───────────────────────────────────────────────────

  /**
   * Generates a unique ticket code in format: EVT-YYYYMMDD-XXXX.
   *
   * @returns 16-character ticket code
   */
  private generateTicketCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `EVT-${date}-${random}`;
  }

  /**
   * Generates a payment reference for event tickets.
   *
   * @param eventTitle - Event title for the prefix
   * @returns Payment reference string
   */
  private generatePaymentReference(eventTitle: string): string {
    const prefix = eventTitle
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 4)
      .toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `EVT/${prefix}/${timestamp}${random}`;
  }

  // ─── MAPPERS ───────────────────────────────────────────────────

  /**
   * Maps a Prisma Event to EventResponseDto.
   *
   * @param event - Raw event record from Prisma
   * @param registrationCount - Number of registrations for this event
   * @returns Formatted event response DTO
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
   * Maps registration data to RegistrationResponseDto.
   *
   * Supports both Prisma EventRegistration records and extended objects
   * with ticket_code and tier_name from joined queries.
   *
   * @param data - Registration data from Prisma
   * @returns Formatted registration response DTO
   */
  private mapRegistrationToDto(
    data: Record<string, unknown> & { id: string; created_at: Date },
  ): RegistrationResponseDto {
    return {
      registrationId: data.id,
      eventId: data.event_id as string,
      memberId: data.member_id as string,
      customData: (data.custom_data as Record<string, unknown>) || undefined,
      paymentStatus: (data.payment_status as string) || 'pending',
      ticketCode: (data.ticket_code as string) || undefined,
      tierName: (data.tier_name as string) || undefined,
      quantity: (data.quantity as number) ?? 1,
      checkedIn: (data.checked_in as boolean) ?? false,
      authorizationUrl: (data.authorizationUrl as string) || undefined,
      paymentReference: (data.payment_reference as string) || undefined,
      createdAt: data.created_at.toISOString(),
    };
  }
}
