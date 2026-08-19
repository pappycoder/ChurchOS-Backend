/**
 * @file whatsapp.service.spec.ts
 * @description Unit tests for WhatsAppService.
 *
 * Tests webhook processing, command routing, message sending, and message listing.
 *
 * @module test/unit/whatsapp/whatsapp.service.spec
 * @since 1.0.0
 */

import { WhatsAppService } from '../../../src/whatsapp/whatsapp.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let config: { get: jest.Mock };
  let audit: { log: jest.Mock };
  let fetchSpy: jest.SpyInstance;

  const mockChurchId = '11111111-1111-1111-1111-111111111111';
  const mockMemberId = '44444444-4444-4444-4444-444444444444';
  const mockPhone = '+2348012345678';
  const mockServiceId = '66666666-6666-6666-6666-666666666666';
  const mockMessageId = 'fake-wa-msg-123';

  const mockProfile = {
    id: mockMemberId,
    member_id: mockMemberId,
    church_id: mockChurchId,
    phone: mockPhone,
  };

  const mockService = {
    id: mockServiceId,
    church_id: mockChurchId,
    name: 'Sunday Service',
    day_of_week: 0,
  };

  const mockMessage = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    church_id: mockChurchId,
    member_id: mockMemberId,
    phone: mockPhone,
    direction: 'outbound',
    channel: 'whatsapp',
    content: 'Hello!',
    media_url: null,
    status: 'sent',
    metadata: {},
    created_at: new Date('2026-07-20T10:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    config = { get: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    // Mock fetch for WhatsApp API calls
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-sent-001' }] }),
    } as Response);

    config.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'WHATSAPP_API_KEY') return 'test-api-key';
      if (key === 'WHATSAPP_API_URL') return 'https://mock.api.url';
      if (key === 'WHATSAPP_PHONE_NUMBER_ID') return '123456789';
      if (key === 'WEB_URL') return 'https://churchos.example.com';
      return defaultVal;
    });

    service = new WhatsAppService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      audit as unknown as AuditLoggingService,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('processWebhook', () => {
    it('should process inbound text messages', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.message.create.mockResolvedValue(mockMessage);

      // Mock HELP command reply
      prisma.message.create.mockResolvedValueOnce(mockMessage);

      const result = await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'HELP' },
          },
        ],
      });

      expect(result.processed).toBe(1);
      // Should log inbound + outbound (HELP reply)
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
    });

    it('should handle status updates', async () => {
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processWebhook({
        statuses: [{ id: 'wa-msg-001', status: 'delivered', timestamp: '1700000001' }],
      });

      expect(result.processed).toBe(1);
      expect(prisma.message.updateMany).toHaveBeenCalled();
    });

    it('should return 0 for empty webhooks', async () => {
      const result = await service.processWebhook({});
      expect(result.processed).toBe(0);
    });
  });

  describe('command: HELP', () => {
    it('should reply with available commands', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'HELP' },
          },
        ],
      });

      // Outbound message should contain command list
      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound).toBeDefined();
      expect(outbound![0].data.content).toContain('CHECKIN');
      expect(outbound![0].data.content).toContain('GIVE');
    });
  });

  describe('command: CHECKIN', () => {
    it('should check in member for today service', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.attendance.findFirst.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({
        id: 'att-1',
        service_id: mockServiceId,
        member_id: mockMemberId,
        checkin_at: new Date(),
        source: 'whatsapp',
      });
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'CHECKIN' },
          },
        ],
      });

      expect(prisma.attendance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            member_id: mockMemberId,
            source: 'whatsapp',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'attendance', action: 'CREATE' }),
      );
    });

    it('should reject duplicate check-in', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.attendance.findFirst.mockResolvedValue({
        id: 'existing-att',
        service_id: mockServiceId,
        member_id: mockMemberId,
      });
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'CHECKIN' },
          },
        ],
      });

      // Should not create a new attendance
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });

    it('should reply with error for non-members', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: '+2349999999999',
            timestamp: '1700000000',
            text: { body: 'CHECKIN' },
          },
        ],
      });

      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound![0].data.content).toContain('not registered');
    });
  });

  describe('command: GIVE', () => {
    it('should reply with giving instructions', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'GIVE' },
          },
        ],
      });

      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound![0].data.content).toContain('Giving');
      expect(outbound![0].data.content).toContain('Bank Transfer');
    });
  });

  describe('command: PRAYER', () => {
    it('should log prayer request with content', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'PRAYER Please pray for my family' },
          },
        ],
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'prayer_request',
          newValues: expect.objectContaining({ content: 'Please pray for my family' }),
        }),
      );
    });

    it('should prompt for content if empty', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'PRAYER' },
          },
        ],
      });

      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound![0].data.content).toContain('prayer request');
    });
  });

  describe('command: EVENTS', () => {
    it('should list upcoming events', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          title: 'Youth Conference',
          start_date: new Date('2026-08-01'),
          description: 'Annual youth gathering',
        },
      ]);
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'EVENTS' },
          },
        ],
      });

      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound![0].data.content).toContain('Upcoming Events');
      expect(outbound![0].data.content).toContain('Youth Conference');
    });
  });

  describe('command: STATUS', () => {
    it('should show giving and attendance summary', async () => {
      prisma.profile.findFirst.mockResolvedValue(mockProfile);
      prisma.attendance.count.mockResolvedValue(8);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 50000 },
        _count: 3,
      });
      prisma.message.create.mockResolvedValue(mockMessage);

      await service.processWebhook({
        messages: [
          {
            id: mockMessageId,
            from: mockPhone,
            timestamp: '1700000000',
            text: { body: 'STATUS' },
          },
        ],
      });

      const calls = prisma.message.create.mock.calls;
      const outbound = calls.find((c) => c[0].data.direction === 'outbound');
      expect(outbound![0].data.content).toContain('8 service(s)');
      expect(outbound![0].data.content).toContain('50,000');
    });
  });

  describe('listMessages', () => {
    it('should return paginated messages', async () => {
      prisma.message.findMany.mockResolvedValue([mockMessage]);
      prisma.message.count.mockResolvedValue(1);

      const result = await service.listMessages(mockChurchId);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].phone).toBe(mockPhone);
    });

    it('should filter by phone', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.listMessages(mockChurchId, 1, 20, '+2348012345678');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone: expect.objectContaining({ contains: '+2348012345678' }),
          }),
        }),
      );
    });

    it('should filter by direction', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.listMessages(mockChurchId, 1, 20, undefined, 'inbound');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ direction: 'inbound' }),
        }),
      );
    });
  });

  describe('sendTemplateMessage', () => {
    it('should send a WhatsApp template message', async () => {
      prisma.message.create.mockResolvedValue(mockMessage);

      const result = await service.sendTemplateMessage(
        mockPhone,
        'welcome_message',
        'en',
        { name: 'Ade', church: 'Grace Community Church' },
        mockChurchId,
        mockMemberId,
      );

      expect(result.messageId).toBe(mockMessage.id);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          body: expect.stringContaining('"type":"template"'),
        }),
      );
    });

    it('should throw if WhatsApp API is not configured', async () => {
      config.get.mockImplementation((key: string, defaultVal?: string) => {
        if (key === 'WHATSAPP_API_KEY') return undefined;
        if (key === 'WHATSAPP_API_URL') return 'https://mock.api.url';
        if (key === 'WHATSAPP_PHONE_NUMBER_ID') return '123456789';
        return defaultVal;
      });

      await expect(
        service.sendTemplateMessage(mockPhone, 'welcome_message', 'en', {}, mockChurchId),
      ).rejects.toThrow('WhatsApp API not configured');
    });
  });

  describe('interpolateTemplate', () => {
    it('should replace {{variable}} placeholders', () => {
      const result = service.interpolateTemplate('Hello {{name}}!', { name: 'Ade' });
      expect(result).toBe('Hello Ade!');
    });

    it('should replace {variable} placeholders', () => {
      const result = service.interpolateTemplate('Hello {name}!', { name: 'Ade' });
      expect(result).toBe('Hello Ade!');
    });
  });
});
