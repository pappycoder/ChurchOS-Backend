import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventWebhooksController } from '../../../src/events/event-webhooks.controller';

describe('EventWebhooksController', () => {
  const rawPayload = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'EVT-REF-001' },
  });
  let eventsService: { confirmTicketPayment: jest.Mock };
  let paystack: { validateWebhookSignature: jest.Mock; parseWebhookEvent: jest.Mock };
  let controller: EventWebhooksController;

  beforeEach(() => {
    eventsService = { confirmTicketPayment: jest.fn().mockResolvedValue({}) };
    paystack = {
      validateWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookEvent: jest
        .fn()
        .mockReturnValue({ event: 'charge.success', reference: 'EVT-REF-001' }),
    };
    controller = new EventWebhooksController(eventsService as never, paystack as never);
  });

  it('validates the exact raw payload before settling the event registration', async () => {
    await expect(
      controller.handlePaystackWebhook('untrusted-event-id', 'signature', {
        rawBody: Buffer.from(rawPayload),
      } as never),
    ).resolves.toEqual({ received: true });

    expect(paystack.validateWebhookSignature).toHaveBeenCalledWith(rawPayload, 'signature');
    expect(eventsService.confirmTicketPayment).toHaveBeenCalledWith('EVT-REF-001');
  });

  it('rejects missing or invalid signatures before parsing the payload', async () => {
    paystack.validateWebhookSignature.mockReturnValue(false);

    await expect(
      controller.handlePaystackWebhook('event-id', '', {
        rawBody: Buffer.from(rawPayload),
      } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(paystack.parseWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects requests without the raw provider payload', async () => {
    await expect(
      controller.handlePaystackWebhook('event-id', 'signature', {} as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('acknowledges an unknown payment reference without exposing tenant data', async () => {
    eventsService.confirmTicketPayment.mockRejectedValue(new NotFoundException());

    await expect(
      controller.handlePaystackWebhook('event-id', 'signature', {
        rawBody: Buffer.from(rawPayload),
      } as never),
    ).resolves.toEqual({ received: true });
  });
});
