/**
 * @file events.service.spec.ts
 * @description Unit tests for EventsService.
 *
 * Tests event CRUD, member registration, capacity checks, duplicate
 * prevention, and deletion guards.
 *
 * @module test/unit/events/events.service.spec
 * @since 1.0.0
 */

import { EventsService } from '../../../src/events/events.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: { log: jest.Mock };
  let gatewayRegistry: Map<string, unknown>;

  const mockChurchId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockEventId = '55555555-5555-5555-5555-555555555555';
  const mockMemberId = '44444444-4444-4444-4444-444444444444';

  const mockEvent = {
    id: mockEventId,
    church_id: mockChurchId,
    branch_id: null,
    title: 'Sunday Worship Service',
    description: 'Weekly worship',
    type: 'service',
    start_date: new Date('2026-08-01T09:00:00.000Z'),
    end_date: new Date('2026-08-01T12:00:00.000Z'),
    location: 'Main Auditorium',
    capacity: 200,
    is_free: true,
    price: null,
    registration_fields: [],
    created_at: new Date('2026-07-20T10:00:00.000Z'),
    updated_at: new Date('2026-07-20T10:00:00.000Z'),
  };

  const mockRegistration = {
    id: '66666666-6666-6666-6666-666666666666',
    event_id: mockEventId,
    member_id: mockMemberId,
    custom_data: {},
    payment_status: 'pending',
    payment_reference: null,
    transaction_id: null,
    ticket_id: null,
    tier_id: null,
    quantity: 1,
    checked_in: false,
    checked_in_at: null,
    created_at: new Date('2026-07-20T10:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    gatewayRegistry = new Map();
    service = new EventsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
      gatewayRegistry as never,
      { createNotification: jest.fn().mockResolvedValue({}), broadcastToChurch: jest.fn().mockResolvedValue({ sent: 0 }) } as never,
    );
  });

  describe('createEvent', () => {
    it('should create an event and return EventResponseDto', async () => {
      prisma.event.create.mockResolvedValue(mockEvent);

      const result = await service.createEvent(
        {
          title: 'Sunday Worship Service',
          description: 'Weekly worship',
          startDate: '2026-08-01T09:00:00.000Z',
          endDate: '2026-08-01T12:00:00.000Z',
          location: 'Main Auditorium',
          capacity: 200,
        },
        mockChurchId,
        mockUserId,
      );

      expect(result.eventId).toBe(mockEventId);
      expect(result.title).toBe('Sunday Worship Service');
      expect(result.registrationCount).toBe(0);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'event', action: 'CREATE' }),
      );
    });
  });

  describe('listEvents', () => {
    it('should return paginated events', async () => {
      prisma.event.findMany.mockResolvedValue([{ ...mockEvent, _count: { registrations: 2 } }]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents({}, mockChurchId);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].registrationCount).toBe(2);
    });

    it('should filter by type', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents({ type: 'conference' }, mockChurchId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'conference' }),
        }),
      );
    });

    it('should filter upcoming events', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents({ dateFilter: 'upcoming' }, mockChurchId);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            start_date: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  describe('getEvent', () => {
    it('should return event by ID', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        _count: { registrations: 5 },
        ticket_tiers: [],
      });

      const result = await service.getEvent(mockEventId, mockChurchId);

      expect(result.eventId).toBe(mockEventId);
      expect(result.registrationCount).toBe(5);
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.getEvent('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateEvent', () => {
    it('should update event fields', async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.event.update.mockResolvedValue({
        ...mockEvent,
        title: 'Updated Title',
        _count: { registrations: 0 },
      });

      const result = await service.updateEvent(
        mockEventId,
        { title: 'Updated Title' },
        mockChurchId,
        mockUserId,
      );

      expect(result.title).toBe('Updated Title');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'event', action: 'UPDATE' }),
      );
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEvent('nonexistent', { title: 'X' }, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteEvent', () => {
    it('should delete event with no registrations', async () => {
      prisma.event.findFirst.mockResolvedValue({ ...mockEvent, _count: { registrations: 0 } });
      prisma.event.delete.mockResolvedValue(mockEvent);

      await service.deleteEvent(mockEventId, mockChurchId, mockUserId);

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: mockEventId } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'event', action: 'DELETE' }),
      );
    });

    it('should block deletion if registrations exist', async () => {
      prisma.event.findFirst.mockResolvedValue({ ...mockEvent, _count: { registrations: 3 } });

      await expect(service.deleteEvent(mockEventId, mockChurchId, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.deleteEvent('nonexistent', mockChurchId, mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('registerForEvent', () => {
    it('should register a member for a free event with ticket', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        _count: { registrations: 0 },
        ticket_tiers: [],
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.member.findFirst.mockResolvedValue({ id: mockMemberId, first_name: 'John', last_name: 'Doe' });
      prisma.eventRegistration.create.mockResolvedValue({
        ...mockRegistration,
        payment_status: 'paid',
      });
      prisma.ticket.create.mockResolvedValue({
        id: '77777777-7777-7777-7777-777777777777',
        code: 'EVT-20260721-A1B2C3',
        status: 'paid',
        tier_name: 'General',
        price_paid: 0,
      });
      prisma.eventRegistration.update.mockResolvedValue(mockRegistration);
      prisma.profile.findMany.mockResolvedValue([]);

      const result = await service.registerForEvent(
        mockEventId,
        mockMemberId,
        undefined,
        mockChurchId,
        mockUserId,
      );

      expect(result.registrationId).toBe(mockRegistration.id);
      expect(result.memberId).toBe(mockMemberId);
      expect(result.paymentStatus).toBe('paid');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'event_registration', action: 'CREATE' }),
      );
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.registerForEvent(mockEventId, mockMemberId, undefined, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already registered', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        _count: { registrations: 0 },
        ticket_tiers: [],
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(mockRegistration);

      await expect(
        service.registerForEvent(mockEventId, mockMemberId, undefined, mockChurchId, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if event at capacity', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        _count: { registrations: 200 },
        ticket_tiers: [],
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);

      await expect(
        service.registerForEvent(mockEventId, mockMemberId, undefined, mockChurchId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if member not found', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...mockEvent,
        _count: { registrations: 0 },
        ticket_tiers: [],
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.registerForEvent(mockEventId, mockMemberId, undefined, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listRegistrations', () => {
    it('should return registrations for an event', async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventRegistration.findMany.mockResolvedValue([mockRegistration]);

      const result = await service.listRegistrations(mockEventId, mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].registrationId).toBe(mockRegistration.id);
    });

    it('should throw NotFoundException if event not found', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.listRegistrations('nonexistent', mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cancelRegistration', () => {
    it('should cancel a registration', async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue({
        ...mockRegistration,
        ticket_id: null,
      });
      prisma.eventRegistration.delete.mockResolvedValue(mockRegistration);

      await service.cancelRegistration(mockEventId, mockMemberId, mockChurchId, mockUserId);

      expect(prisma.eventRegistration.delete).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'event_registration', action: 'DELETE' }),
      );
    });

    it('should throw NotFoundException if registration not found', async () => {
      prisma.event.findFirst.mockResolvedValue(mockEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelRegistration(mockEventId, mockMemberId, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmTicketPayment', () => {
    const paymentReference = 'EVT-REF-001';
    const paidRegistration = {
      ...mockRegistration,
      payment_reference: paymentReference,
      transaction_id: 'transaction-1',
      event: mockEvent,
    };
    const paidTicket = {
      id: 'ticket-1',
      code: 'EVT-20260721-A1B2C3',
      registration_id: mockRegistration.id,
      tier_name: 'General',
      status: 'paid',
    };

    beforeEach(() => {
      (prisma as unknown as { $transaction: jest.Mock }).$transaction.mockImplementation(
        async (callback: (client: typeof prisma) => unknown) => callback(prisma),
      );
    });

    it('should atomically settle a pending registration and issue one ticket', async () => {
      prisma.eventRegistration.findFirst.mockResolvedValue(paidRegistration);
      prisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
      prisma.eventTicketTier.findUnique.mockResolvedValue(null);
      prisma.transaction.findUnique.mockResolvedValue({ amount: 5000 });
      prisma.ticket.create.mockResolvedValue(paidTicket);
      prisma.eventRegistration.update.mockResolvedValue({
        ...paidRegistration,
        ticket_id: paidTicket.id,
      });
      prisma.transaction.update.mockResolvedValue({});

      const result = await service.confirmTicketPayment(paymentReference);

      expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
        where: { id: mockRegistration.id, payment_status: 'pending' },
        data: { payment_status: 'paid' },
      });
      expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
      expect(result.paymentStatus).toBe('paid');
      expect(result.ticketCode).toBe(paidTicket.code);
    });

    it('should return the existing ticket when a concurrent delivery already settled it', async () => {
      prisma.eventRegistration.findFirst.mockResolvedValue(paidRegistration);
      prisma.eventRegistration.updateMany.mockResolvedValue({ count: 0 });
      prisma.eventRegistration.findUnique.mockResolvedValue({
        ...paidRegistration,
        payment_status: 'paid',
      });
      prisma.ticket.findFirst.mockResolvedValue(paidTicket);

      const result = await service.confirmTicketPayment(paymentReference);

      expect(prisma.ticket.create).not.toHaveBeenCalled();
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(result.paymentStatus).toBe('paid');
      expect(result.ticketCode).toBe(paidTicket.code);
    });
  });
});
