import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { GivingService } from '../giving/giving.service';
import { EventsService } from '../events/events.service';
@Controller('integrations/payments/webhook')
export class PaymentCallbacksController {
  constructor(
    private readonly giving: GivingService,
    private readonly events: EventsService,
    private readonly prisma: PrismaService,
  ) {}
  @Post(':provider')
  @HttpCode(200)
  async receive(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string>,
    @Request() req: RawBodyRequest<ExpressRequest>,
  ) {
    if (!['paystack', 'flutterwave'].includes(provider) || !req.rawBody)
      throw new BadRequestException('Unsupported payment callback');
    const payload = req.rawBody.toString('utf8');
    const result = await this.giving.handleWebhook(
      payload,
      headers[provider === 'paystack' ? 'x-paystack-signature' : 'flutterwave-signature'] ??
        headers['verif-hash'] ??
        '',
      provider,
    );
    if (result.processed) {
      const body = JSON.parse(payload) as { data?: { reference?: string; tx_ref?: string } };
      const reference = body.data?.reference ?? body.data?.tx_ref;
      if (reference) {
        const transaction = await this.prisma.transaction.findFirst({
          where: {
            payment_reference: reference,
            payment_gateway: provider as 'paystack' | 'flutterwave',
            status: 'success',
          },
        });
        if ((transaction?.metadata as Record<string, unknown> | null)?.type === 'event_ticket')
          await this.events.confirmTicketPayment(reference);
      }
    }
    return { received: true };
  }
}
