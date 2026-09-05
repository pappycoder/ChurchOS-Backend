/**
 * @file event-webhooks.controller.ts
 * @description Public, signature-verified payment webhooks for event tickets.
 */

import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaystackService } from '../giving/services/paystack.service';
import { EventsService } from './events.service';
import { SkipRateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('Events')
@Controller('events')
export class EventWebhooksController {
  private readonly logger = new Logger(EventWebhooksController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly paystack: PaystackService,
  ) {}

  @Post(':eventId/webhook/paystack')
  @SkipRateLimit()
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-paystack-signature', description: 'Paystack HMAC-SHA512 signature' })
  @ApiOperation({
    summary: 'Paystack event-ticket webhook',
    description: 'Validates the provider signature and settles the matching event registration.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID (not trusted for tenant resolution)' })
  async handlePaystackWebhook(
    @Param('eventId') _eventId: string,
    @Headers('x-paystack-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody) {
      throw new BadRequestException('Missing raw webhook payload');
    }

    if (!this.paystack.validateWebhookSignature(rawBody, signature || '')) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }

    const event = this.paystack.parseWebhookEvent(rawBody);
    if (event.event !== 'charge.success' || !event.reference) {
      return { received: true };
    }

    try {
      // Tenant scope is derived from the registration's event, never from the request.
      await this.eventsService.confirmTicketPayment(event.reference);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Ignoring unknown event payment reference: ${event.reference}`);
        return { received: true };
      }
      throw error;
    }

    return { received: true };
  }
}
