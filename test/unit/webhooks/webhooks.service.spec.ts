/**
 * @file webhooks.service.spec.ts
 * @description Unit tests for WebhooksService.
 *
 * @module test/unit/webhooks/webhooks.service.spec
 */

import { WebhooksService } from '../../../src/webhooks/webhooks.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { CreateWebhookSubscriptionDto } from '../../../src/webhooks/dto/create-webhook-subscription.dto';
import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

describe('WebhooksService', () => {
  const mockChurchId = '00000000-0000-0000-0000-000000000001';
  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockSubId = '22222222-2222-2222-2222-222222222222';

  let prisma: {
    webhookSubscription: Record<string, jest.Mock>;
    webhookDelivery: Record<string, jest.Mock>;
  };
  let audit: { log: jest.Mock };
  let webhookQueue: { add: jest.Mock };
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      webhookSubscription: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      webhookDelivery: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    webhookQueue = { add: jest.fn().mockResolvedValue(undefined) };

    service = new WebhooksService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditLoggingService,
      webhookQueue as unknown as Queue,
    );
  });

  describe('createSubscription', () => {
    it('should create a subscription with a generated secret and audit log it', async () => {
      prisma.webhookSubscription.create.mockResolvedValue({
        id: mockSubId,
        url: 'https://example.com/hook',
        events: ['member.created'],
        secret: 'auto-secret',
        is_active: true,
        created_at: new Date('2026-07-22T10:00:00Z'),
      });

      const dto = {
        url: 'https://example.com/hook',
        events: ['member.created'],
      } as CreateWebhookSubscriptionDto;
      const result = await service.createSubscription(dto, mockChurchId, mockUserId);

      expect(prisma.webhookSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            church_id: mockChurchId,
            url: dto.url,
            events: dto.events,
            secret: expect.any(String),
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'webhook_subscription',
          action: 'CREATE',
          entityId: mockSubId,
        }),
      );
      expect(result).toMatchObject({
        id: mockSubId,
        url: 'https://example.com/hook',
        events: ['member.created'],
        isActive: true,
      });
    });
  });

  describe('listSubscriptions', () => {
    it('should list subscriptions scoped by church', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        {
          id: mockSubId,
          url: 'https://example.com/hook',
          events: ['member.created'],
          is_active: true,
          created_at: new Date('2026-07-22T10:00:00Z'),
        },
      ]);

      const result = await service.listSubscriptions(mockChurchId);

      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: { church_id: mockChurchId },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: mockSubId, isActive: true });
    });
  });

  describe('deactivateSubscription', () => {
    it('should deactivate and audit', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue({ id: mockSubId, is_active: true });
      prisma.webhookSubscription.update.mockResolvedValue({ id: mockSubId, is_active: false });

      const result = await service.deactivateSubscription(mockSubId, mockChurchId, mockUserId);

      expect(result).toEqual({ deactivated: true });
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: mockSubId },
        data: { is_active: false },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: mockSubId, action: 'UPDATE' }),
      );
    });

    it('should throw NotFound when subscription does not belong to the church', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivateSubscription(mockSubId, mockChurchId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDeliveries', () => {
    it('should return delivery history for a church-owned subscription', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue({ id: mockSubId });
      prisma.webhookDelivery.findMany.mockResolvedValue([
        {
          id: 'dlv-1',
          event: 'member.created',
          status: 'success',
          response_status: 200,
          attempts: 1,
          created_at: new Date('2026-07-22T10:00:00Z'),
        },
      ]);

      const result = await service.listDeliveries(mockSubId, mockChurchId, 20);

      expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { subscription_id: mockSubId }, take: 20 }),
      );
      expect(result[0]).toMatchObject({
        id: 'dlv-1',
        event: 'member.created',
        status: 'success',
        responseStatus: 200,
      });
    });
  });

  describe('testDelivery', () => {
    it('should create a pending delivery and enqueue it', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue({
        id: mockSubId,
        url: 'https://example.com/hook',
        secret: 'secret',
      });
      prisma.webhookDelivery.create.mockResolvedValue({ id: 'dlv-1' });

      const result = await service.testDelivery(mockSubId, mockChurchId);

      expect(result).toEqual({ deliveryId: 'dlv-1' });
      expect(webhookQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          deliveryId: 'dlv-1',
          subscriptionId: mockSubId,
          event: 'test.ping',
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should throw NotFound for inactive subscriptions', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue(null);

      await expect(service.testDelivery(mockSubId, mockChurchId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('notifySubscribers', () => {
    it('should queue deliveries for matching active subscriptions', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        { id: mockSubId, url: 'https://example.com/hook', secret: 'secret' },
      ]);
      prisma.webhookDelivery.create.mockResolvedValue({ id: 'dlv-1' });

      const result = await service.notifySubscribers(mockChurchId, 'member.created', {
        memberId: 'm-1',
      });

      expect(result).toEqual({ queued: 1 });
      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          church_id: mockChurchId,
          is_active: true,
          events: { has: 'member.created' },
        },
      });
      expect(webhookQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ event: 'member.created' }),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should continue on per-subscription failures', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        { id: mockSubId, url: 'https://example.com/hook', secret: 'secret' },
      ]);
      prisma.webhookDelivery.create.mockRejectedValue(new Error('db down'));

      const result = await service.notifySubscribers(mockChurchId, 'member.created', {});

      expect(result).toEqual({ queued: 0 });
      expect(webhookQueue.add).not.toHaveBeenCalled();
    });
  });
});
