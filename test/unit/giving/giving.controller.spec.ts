import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';
import { GivingDashboardQueryDto } from '../../../src/giving/dto/dashboard-query.dto';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

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

describe('Giving dashboard read isolation', () => {
  it('uses independent dashboard and transaction read grants', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, GivingController.prototype.getDashboard)).toEqual([
      'giving:dashboard:read',
    ]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, GivingController.prototype.getTransactionsSummary),
    ).toEqual(['giving:records:read']);
  });

  it('preserves the viewer scope while returning only service aggregates', async () => {
    const totals = { monthTotal: 10, monthCount: 1, allTimeTotal: 20, count: 2, trend: [] };
    const service = { getTransactionsSummary: jest.fn().mockResolvedValue(totals) };
    const controller = new GivingController(service as never);
    const profile = { church_id: 'church', branch_id: 'branch-a', is_admin_hq: false };
    await expect(controller.getDashboard({}, { profile } as never)).resolves.toEqual(totals);
    expect(service.getTransactionsSummary).toHaveBeenCalledWith('church', {}, profile);
  });

  it('rejects donor selectors on the aggregate-only dashboard', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { memberId: 'donor-id' },
        { type: 'query', metatype: GivingDashboardQueryDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
