/**
 * @file webhook-delivery.processor.spec.ts
 * @description Unit tests for WebhookDeliveryProcessor.
 *
 * @module test/unit/webhooks/webhook-delivery.processor.spec
 */

import { createHmac } from 'crypto';
import { WebhookDeliveryProcessor } from '../../../src/webhooks/webhook-delivery.processor';
import { PrismaService } from '../../../src/prisma/prisma.service';

const deliveryId = 'dlv-11111111';
const secret = 'supersecret';

describe('WebhookDeliveryProcessor', () => {
  let prisma: { webhookDelivery: Record<string, jest.Mock> };
  let processor: WebhookDeliveryProcessor;
  let fetchMock: jest.Mock;

  const baseJob = {
    data: {
      deliveryId,
      subscriptionId: 'sub-1',
      url: 'https://example.com/hook',
      secret,
      event: 'member.created',
      payload: { memberId: 'm-1' },
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };

  beforeEach(() => {
    prisma = {
      webhookDelivery: {
        update: jest.fn(),
      },
    };
    processor = new WebhookDeliveryProcessor(prisma as unknown as PrismaService);
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('process', () => {
    it('should increment attempts, sign the payload, and mark the delivery successful', async () => {
      let captured: { body: string; headers: Record<string, string> } | undefined;
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        captured = {
          body: init.body as string,
          headers: init.headers as Record<string, string>,
        };
        return {
          ok: true,
          status: 200,
          text: async () => '{"ok":true}',
        };
      });

      prisma.webhookDelivery.update.mockResolvedValue({});

      await processor.process(baseJob as never);

      expect(prisma.webhookDelivery.update).toHaveBeenNthCalledWith(1, {
        where: { id: deliveryId },
        data: { attempts: { increment: 1 } },
      });

      expect(captured).toBeDefined();
      const expectedSig = createHmac('sha256', secret).update(captured!.body).digest('hex');
      expect(captured!.headers['X-Webhook-Signature']).toBe(`sha256=${expectedSig}`);
      expect(captured!.headers['X-Webhook-Event']).toBe('member.created');
      expect(captured!.body).toContain('"event":"member.created"');
      expect(captured!.body).toContain('"payload":{"memberId":"m-1"}');

      expect(prisma.webhookDelivery.update).toHaveBeenNthCalledWith(2, {
        where: { id: deliveryId },
        data: {
          status: 'success',
          response_status: 200,
          response_body: '{"ok":true}',
        },
      });
    });

    it('should throw when the target returns a non-OK status', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      });

      await expect(processor.process(baseJob as never)).rejects.toThrow(/HTTP 500/);
    });
  });

  describe('onFailed', () => {
    it('should mark the delivery as failed with the error message', async () => {
      prisma.webhookDelivery.update.mockResolvedValue({});

      await processor.onFailed({ ...baseJob, id: 'job-1' } as never, new Error('connection reset'));

      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          response_body: 'connection reset',
        },
      });
    });
  });
});
