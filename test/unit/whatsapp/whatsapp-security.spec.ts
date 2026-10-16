import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WhatsAppController } from '../../../src/whatsapp/whatsapp.controller';
import { CustomFieldsController } from '../../../src/custom-fields/custom-fields.controller';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';

describe('Messaging and field definition authorization', () => {
  const reflector = new Reflector();
  const service = { processWebhook: jest.fn().mockResolvedValue({ processed: 1 }) };
  const controller = new WhatsAppController(
    service as never,
    { platformWebhookChurch: jest.fn().mockResolvedValue('church-a') } as never,
  );
  const originalSecret = process.env.TERMII_WEBHOOK_SECRET;
  afterEach(() => {
    jest.clearAllMocks();
    if (originalSecret === undefined) delete process.env.TERMII_WEBHOOK_SECRET;
    else process.env.TERMII_WEBHOOK_SECRET = originalSecret;
  });

  it.each(['sendMessage', 'sendTemplateMessage'] as const)(
    'requires sending permission for %s',
    (method) => {
      expect(reflector.get(PERMISSIONS_KEY, WhatsAppController.prototype[method])).toEqual([
        'whatsapp:create',
      ]);
    },
  );

  it('requires read permission for message history', () => {
    expect(reflector.get(PERMISSIONS_KEY, WhatsAppController.prototype.listMessages)).toEqual([
      'whatsapp:read',
    ]);
  });

  it.each(['create', 'update', 'remove', 'archive', 'restore'] as const)(
    'protects custom field %s',
    (method) => {
      expect(reflector.get(PERMISSIONS_KEY, CustomFieldsController.prototype[method])).toEqual([
        'church_settings:update',
      ]);
    },
  );

  it('rejects unsigned, unconfigured, and missing-raw-body webhooks', async () => {
    delete process.env.TERMII_WEBHOOK_SECRET;
    await expect(
      controller.processWebhook({}, { headers: {}, rawBody: Buffer.from('{}') } as never),
    ).rejects.toThrow(UnauthorizedException);
    process.env.TERMII_WEBHOOK_SECRET = 'test-secret';
    await expect(controller.processWebhook({}, { headers: {} } as never)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.processWebhook({}, { headers: {}, rawBody: Buffer.from('{}') } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.processWebhook).not.toHaveBeenCalled();
  });

  it('accepts only a signature matching the exact raw payload', async () => {
    process.env.TERMII_WEBHOOK_SECRET = 'test-secret';
    const rawBody = Buffer.from('{"ok":true}');
    const signature = `sha512=${createHmac('sha512', 'test-secret').update(rawBody).digest('hex')}`;
    await expect(
      controller.processWebhook({ ok: true }, {
        headers: { 'x-termii-signature': signature },
        rawBody,
      } as never),
    ).resolves.toEqual({ success: true, processed: 1 });
    service.processWebhook.mockClear();
    await expect(
      controller.processWebhook({}, {
        headers: { 'x-termii-signature': signature },
        rawBody: Buffer.from('{}'),
      } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.processWebhook).not.toHaveBeenCalled();
  });
});
