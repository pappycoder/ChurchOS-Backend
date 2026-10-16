import { RawResponse } from '../common/decorators/raw-response.decorator';
import type { Response as ExpressResponse } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Res,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { IntegrationAccountsService } from './integration-accounts.service';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
@Controller('integrations/webhooks')
export class IntegrationCallbacksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: IntegrationAccountsService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
  ) {}
  private async target(id: string) {
    const row = await this.prisma.integrationAccount.findFirst({
      where: { id, archived_at: null },
    });
    if (!row) throw new UnauthorizedException('Callback account is unavailable');
    const account = await this.accounts.account(row.church_id, row.id);
    return { churchId: row.church_id, ...account };
  }
  @Get(':id')
  @RawResponse()
  @Header('Content-Type', 'text/plain')
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const account = await this.target(id);
    if (
      account.provider !== 'meta' ||
      mode !== 'subscribe' ||
      !token ||
      !same(token, account.credentials.verifyToken)
    )
      throw new UnauthorizedException('Invalid subscription token');
    return challenge;
  }
  @Post(':id')
  @RawResponse()
  @HttpCode(200)
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: AuthenticatedRequest & { rawBody?: Buffer },
    @Res({ passthrough: true }) response: ExpressResponse,
  ) {
    const { churchId, provider, credentials: c } = await this.target(id);
    if (!req.rawBody) throw new UnauthorizedException('Raw callback payload is required');
    if (provider === 'meta' || provider === 'termii') {
      const algorithm = provider === 'meta' ? 'sha256' : 'sha512';
      const received =
        req.headers[provider === 'meta' ? 'x-hub-signature-256' : 'x-termii-signature'];
      const key = provider === 'meta' ? c.appSecret : c.webhookSecret;
      const signature =
        typeof received === 'string' ? received.replace(new RegExp(`^${algorithm}=`), '') : '';
      if (!key || !same(createHmac(algorithm, key).update(req.rawBody).digest('hex'), signature))
        throw new UnauthorizedException('Invalid provider signature');
    } else if (provider === 'twilio') {
      const origin = this.config.get<string>('PUBLIC_API_URL');
      if (!origin) throw new UnauthorizedException('Public API origin is not configured');
      if (Object.values(body).some((value) => typeof value !== 'string'))
        throw new BadRequestException('Invalid Twilio callback form');
      const content =
        `${origin.replace(/\/$/, '')}${req.originalUrl}` +
        Object.keys(body)
          .sort()
          .map((key) => `${key}${body[key]}`)
          .join('');
      const signature = req.headers['x-twilio-signature'];
      if (
        typeof signature !== 'string' ||
        !same(createHmac('sha1', c.authToken).update(content).digest('base64'), signature)
      )
        throw new UnauthorizedException('Invalid provider signature');
    } else throw new BadRequestException('Provider has no messaging callback');
    const binding = await this.prisma.integrationChannel.findUnique({
      where: { church_id_channel: { church_id: churchId, channel: 'whatsapp' } },
    });
    if (provider === 'meta') {
      if (binding?.mode !== 'custom' || binding.account_id !== id)
        throw new UnauthorizedException('WhatsApp account is no longer active');
      const entries = body.entry as
        | {
            changes?: {
              value?: {
                metadata?: { phone_number_id?: string };
                messages?: { from: string }[];
                statuses?: unknown[];
              };
            }[];
          }[]
        | undefined;
      let processed = 0;
      for (const entry of entries ?? [])
        for (const change of entry.changes ?? []) {
          const value = change.value;
          if (!value || value.metadata?.phone_number_id !== c.phoneNumberId) continue;
          const result = await this.whatsapp.processWebhook(
            {
              ...value,
              messages: value.messages?.map((message) => ({
                ...message,
                from: `+${message.from.replace(/^\+/, '')}`,
              })),
            },
            churchId,
          );
          processed += result.processed;
        }
      return { processed };
    }
    if (provider === 'twilio') {
      if (typeof body.From === 'string' && body.From.startsWith('whatsapp:') && body.Body) {
        if (binding?.mode !== 'custom' || binding.account_id !== id)
          throw new UnauthorizedException('WhatsApp account is no longer active');
        await this.whatsapp.processWebhook(
          {
            type: 'inbound',
            sender: body.From.replace(/^whatsapp:\+?/, ''),
            message: String(body.Body),
            message_id: String(body.MessageSid ?? ''),
            channel: 'whatsapp',
          },
          churchId,
        );
        response.type('text/xml');
        return '<Response/>';
      }
      const providerId = body.MessageSid ?? body.CallSid;
      const status = body.MessageStatus ?? body.CallStatus;
      if (typeof providerId === 'string' && typeof status === 'string')
        await this.prisma.message.updateMany({
          where: { church_id: churchId, metadata: { path: ['provider_id'], equals: providerId } },
          data: { status },
        });
      response.type('text/xml');
      return '<Response/>';
    }
    // Termii delivery receipts may belong to an independently configured SMS channel.
    if (body.type !== 'inbound' && typeof body.status === 'string') {
      const providerId = body.message_id ?? body.id;
      if (typeof providerId === 'string')
        await this.prisma.message.updateMany({
          where: {
            church_id: churchId,
            AND: [
              { metadata: { path: ['provider_id'], equals: providerId } },
              { metadata: { path: ['integration_account_id'], equals: id } },
            ],
          },
          data: { status: body.status },
        });
      return { received: true };
    }
    if (body.channel === 'generic' || body.channel === 'dnd') return { received: true };
    if (binding?.mode !== 'custom' || binding.account_id !== id)
      throw new UnauthorizedException('WhatsApp account is no longer active');
    return this.whatsapp.processWebhook(body, churchId);
  }
}
