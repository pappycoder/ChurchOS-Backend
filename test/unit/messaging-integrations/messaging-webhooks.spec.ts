import { createHmac } from 'node:crypto';
import { WhatsAppController } from '../../../src/whatsapp/whatsapp.controller';
import { WhatsAppService } from '../../../src/whatsapp/whatsapp.service';
import { MessagingCredentialsService } from '../../../src/messaging-integrations/messaging-credentials.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { TermiiService } from '../../../src/communication/termii.service';
import { ModuleRef } from '@nestjs/core';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

jest.mock('jose', () => ({}));

describe('Church-specific WhatsApp callbacks', () => {
  const secrets: Record<string, string> = {
    'church-a': 'a'.repeat(32),
    'church-b': 'b'.repeat(32),
  };
  const processWebhook = jest.fn().mockResolvedValue({ processed: 1 });
  const credentials = {
    webhookCredentials: jest.fn((churchId: string) => ({
      webhookSecret: secrets[churchId],
      verifyToken: `${churchId}-verification-token`,
    })),
  };
  const controller = new WhatsAppController(
    { processWebhook } as unknown as WhatsAppService,
    credentials as unknown as MessagingCredentialsService,
  );
  const body = { type: 'inbound', sender: '2348012345678', message: 'HELP' };
  const rawBody = Buffer.from(JSON.stringify(body));
  const request = (signature: string) =>
    ({ rawBody, headers: { 'x-termii-signature': signature } }) as never;

  it('accepts an exact payload signed by the destination church and passes that church to processing', async () => {
    const signature = `sha512=${createHmac('sha512', secrets['church-a']).update(rawBody).digest('hex')}`;
    await expect(
      controller.processChurchWebhook('church-a', body, request(signature)),
    ).resolves.toEqual({ success: true, processed: 1 });
    expect(processWebhook).toHaveBeenCalledWith(body, 'church-a');
  });
  it('rejects signatures from another church, malformed signatures and modified payloads', async () => {
    const signature = `sha512=${createHmac('sha512', secrets['church-b']).update(rawBody).digest('hex')}`;
    await expect(
      controller.processChurchWebhook('church-a', body, request(signature)),
    ).rejects.toThrow('signature');
    for (const value of [
      'sha512=00',
      'sha512=' + 'a'.repeat(64) + 'garbage',
      '',
      'sha512=' + 'z'.repeat(64),
    ])
      await expect(
        controller.processChurchWebhook('church-a', body, request(value)),
      ).rejects.toThrow();
    expect(processWebhook).not.toHaveBeenCalled();
  });
  it('verifies the church-specific subscription token', async () => {
    expect(
      await controller.verifyChurchWebhook(
        'church-a',
        'subscribe',
        'church-a-verification-token',
        'challenge',
      ),
    ).toBe('challenge');
    await expect(
      controller.verifyChurchWebhook(
        'church-a',
        'subscribe',
        'church-b-verification-token',
        'challenge',
      ),
    ).rejects.toThrow();
  });

  it('scopes flat and legacy delivery updates and phone lookups to the authenticated webhook church', async () => {
    const prisma = createPrismaMock();
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
    prisma.profile.findFirst.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({
      id: 'message',
      created_at: new Date(),
      metadata: {},
    });
    const termii = { sendWhatsAppMessage: jest.fn().mockResolvedValue({ requestId: 'request' }) };
    const service = new WhatsAppService(
      prisma as unknown as PrismaService,
      new RequestContextService(),
      new ConfigService(),
      { log: jest.fn() } as unknown as AuditLoggingService,
      termii as unknown as TermiiService,
      { get: jest.fn() } as unknown as ModuleRef,
    );
    await service.processWebhook(
      {
        type: 'delivery',
        channel: 'whatsapp',
        message_id: 'same-provider-id',
        status: 'delivered',
      },
      'church-a',
    );
    await service.processWebhook(
      { statuses: [{ id: 'same-provider-id', status: 'read' }] },
      'church-b',
    );
    expect(prisma.message.updateMany.mock.calls[0][0].where.church_id).toBe('church-a');
    expect(prisma.message.updateMany.mock.calls[1][0].where.church_id).toBe('church-b');
    await service.processWebhook(body, 'church-a');
    expect(prisma.profile.findFirst).toHaveBeenCalledWith({
      where: { phone: '+2348012345678', church_id: 'church-a' },
      select: { church_id: true, member_id: true },
    });
    expect(
      prisma.message.create.mock.calls.every(([input]) => input.data.church_id === 'church-a'),
    ).toBe(true);
    expect(termii.sendWhatsAppMessage).toHaveBeenCalledWith(
      '+2348012345678',
      expect.any(String),
      'church-a',
    );
  });
});
