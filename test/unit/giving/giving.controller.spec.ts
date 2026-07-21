import { BadRequestException } from '@nestjs/common';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
  decodeJwt: jest.fn(),
}));

import { GivingController } from '../../../src/giving/giving.controller';

describe('GivingController webhooks', () => {
  const rawPayload = '{"event":"charge.success", "data":{"reference":"REF-1"}}';
  let givingService: { handleWebhook: jest.Mock };
  let controller: GivingController;

  beforeEach(() => {
    givingService = { handleWebhook: jest.fn().mockResolvedValue({ received: true }) };
    controller = new GivingController(givingService as never);
  });

  it('passes the exact raw Paystack payload to signature validation', async () => {
    await controller.handlePaystackWebhook('signature', {
      rawBody: Buffer.from(rawPayload),
    } as never);

    expect(givingService.handleWebhook).toHaveBeenCalledWith(rawPayload, 'signature', 'paystack');
  });

  it('rejects a webhook request that does not have its original payload', async () => {
    await expect(controller.handleFlutterwaveWebhook('signature', {} as never)).rejects.toThrow(
      BadRequestException,
    );
  });
});
