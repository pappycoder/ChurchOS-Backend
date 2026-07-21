/**
 * @file whatsapp.service.ts
 * @description WhatsApp Business API integration service.
 *
 * Handles inbound webhook processing, command routing, outbound message sending,
 * and message logging for the 360dialog WhatsApp Business API.
 *
 * Command Router:
 *   CHECKIN — Mark attendance for today's service
 *   GIVE    — Provide giving link / instructions
 *   HELP    — Show available commands
 *   PRAYER  — Acknowledge prayer request
 *   EVENTS  — Show upcoming events
 *   STATUS  — Show member giving/attendance summary
 *
 * @module whatsapp/whatsapp.service
 * @since 1.0.0
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { WebhookBodyDto } from './dto/webhook.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { Prisma, MessageDirection } from '@prisma/client';

/**
 * Normalized inbound message used by the command router.
 */
interface NormalizedMessage {
  phone: string;
  body: string;
  messageId: string;
  timestamp: string;
  memberId: string | null;
  churchId: string;
}

type CommandHandler = (msg: NormalizedMessage, args: string) => Promise<string>;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly commandHandlers = new Map<string, CommandHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLoggingService,
  ) {
    this.registerCommands();
  }

  // ─── COMMAND REGISTRY ──────────────────────────────────────────

  private registerCommands(): void {
    this.commandHandlers.set('HELP', this.handleHelp.bind(this));
    this.commandHandlers.set('CHECKIN', this.handleCheckin.bind(this));
    this.commandHandlers.set('GIVE', this.handleGive.bind(this));
    this.commandHandlers.set('PRAYER', this.handlePrayer.bind(this));
    this.commandHandlers.set('EVENTS', this.handleEvents.bind(this));
    this.commandHandlers.set('STATUS', this.handleStatus.bind(this));
  }

  /**
   * Process an inbound WhatsApp webhook from 360dialog.
   */
  async processWebhook(body: WebhookBodyDto): Promise<{ processed: number }> {
    if (!body.messages || body.messages.length === 0) {
      // Status update — handle delivery/read receipts
      if (body.statuses && body.statuses.length > 0) {
        await this.handleStatusUpdates(body.statuses);
        return { processed: body.statuses.length };
      }
      return { processed: 0 };
    }

    let processed = 0;

    for (const msg of body.messages) {
      try {
        const normalized = await this.normalizeMessage(
          msg.from,
          msg.id,
          msg.timestamp,
          msg.text?.body,
        );
        if (normalized) {
          await this.routeMessage(normalized);
          processed++;
        }
      } catch (err) {
        this.logger.error(`Failed to process message ${msg.id}: ${(err as Error).message}`);
      }
    }

    return { processed };
  }

  /**
   * Send an outbound WhatsApp message via 360dialog API.
   * Logs the message to the database.
   */
  async sendMessage(
    to: string,
    content: string,
    churchId: string,
    memberId?: string,
  ): Promise<MessageResponseDto> {
    const apiKey = this.config.get<string>('WHATSAPP_API_KEY');
    const apiUrl = this.config.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com/v18.0');

    if (!apiKey) {
      throw new InternalServerErrorException('WhatsApp API not configured');
    }

    // 360dialog uses the Cloud API endpoint
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    try {
      const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace('+', ''),
          type: 'text',
          text: { body: content },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`360dialog send failed: ${response.status} ${error}`);
        throw new InternalServerErrorException('Failed to send WhatsApp message');
      }

      const result = (await response.json()) as {
        messages?: { id: string }[];
      };
      const waMessageId = result.messages?.[0]?.id;

      // Log outbound message
      const message = await this.prisma.message.create({
        data: {
          church_id: churchId,
          member_id: memberId ?? null,
          phone: to,
          direction: MessageDirection.outbound,
          channel: 'whatsapp',
          content,
          status: 'sent',
          metadata: { wa_message_id: waMessageId } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`WhatsApp sent: ${to} (${content.substring(0, 50)}...)`);

      return this.mapMessageToDto(message);
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`WhatsApp send error: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to send WhatsApp message');
    }
  }

  /**
   * Lists messages with pagination and filters.
   */
  async listMessages(
    churchId: string,
    page = 1,
    limit = 20,
    phone?: string,
    direction?: string,
  ): Promise<{ data: MessageResponseDto[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.MessageWhereInput = {
      church_id: churchId,
    };

    if (phone) {
      where.phone = { contains: phone };
    }

    if (direction) {
      where.direction = direction as MessageDirection;
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data: messages.map((m) => this.mapMessageToDto(m)),
      total,
    };
  }

  // ─── MESSAGE NORMALIZATION ──────────────────────────────────────

  private async normalizeMessage(
    phone: string,
    messageId: string,
    timestamp: string,
    body?: string,
  ): Promise<NormalizedMessage | null> {
    if (!body || body.trim().length === 0) {
      this.logger.debug(`Skipping non-text message from ${phone}`);
      return null;
    }

    // Look up member by phone number
    const profile = await this.prisma.profile.findFirst({
      where: { phone },
      select: { id: true, church_id: true },
    });

    const churchId = profile?.church_id || '';
    const memberId = profile?.id || null;

    // Log inbound message
    await this.prisma.message.create({
      data: {
        church_id: churchId,
        member_id: memberId,
        phone,
        direction: MessageDirection.inbound,
        channel: 'whatsapp',
        content: body,
        status: 'delivered',
        metadata: { wa_message_id: messageId } as Prisma.InputJsonValue,
      },
    });

    return {
      phone,
      body: body.trim(),
      messageId,
      timestamp,
      memberId,
      churchId,
    };
  }

  // ─── COMMAND ROUTER ────────────────────────────────────────────

  private async routeMessage(msg: NormalizedMessage): Promise<void> {
    const text = msg.body.toUpperCase().trim();
    const spaceIdx = text.indexOf(' ');
    const command = spaceIdx === -1 ? text : text.substring(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : msg.body.substring(spaceIdx + 1).trim();

    const handler = this.commandHandlers.get(command);

    if (handler) {
      try {
        const reply = await handler(msg, args);
        if (reply) {
          await this.sendMessage(msg.phone, reply, msg.churchId, msg.memberId ?? undefined);
        }
      } catch (err) {
        this.logger.error(`Command ${command} failed for ${msg.phone}: ${(err as Error).message}`);
        await this.sendMessage(
          msg.phone,
          'Sorry, something went wrong. Please try again later.',
          msg.churchId,
          msg.memberId ?? undefined,
        );
      }
    } else {
      // Unknown command — show help
      const reply = await this.handleHelp(msg, '');
      await this.sendMessage(msg.phone, reply, msg.churchId, msg.memberId ?? undefined);
    }
  }

  // ─── COMMAND HANDLERS ──────────────────────────────────────────

  private async handleHelp(_msg: NormalizedMessage, _args: string): Promise<string> {
    return [
      '🙏 *Welcome to ChurchOS*',
      '',
      'Available commands:',
      '• CHECKIN — Mark your attendance',
      '• GIVE — Get giving instructions',
      '• PRAYER — Submit a prayer request',
      '• EVENTS — See upcoming events',
      '• STATUS — View your giving/attendance',
      '• HELP — Show this message',
    ].join('\n');
  }

  private async handleCheckin(msg: NormalizedMessage, _args: string): Promise<string> {
    if (!msg.memberId) {
      return 'You are not registered as a member. Please visit our church to register.';
    }

    // Find today's service (match day_of_week: 0=Sunday, 6=Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday

    const service = await this.prisma.service.findFirst({
      where: {
        church_id: msg.churchId,
        is_active: true,
        day_of_week: dayOfWeek,
      },
      orderBy: { created_at: 'asc' },
    });

    if (!service) {
      return 'No service scheduled for today. Check EVENTS for upcoming services.';
    }

    // Check for duplicate check-in
    const existing = await this.prisma.attendance.findFirst({
      where: {
        service_id: service.id,
        member_id: msg.memberId,
      },
    });

    if (existing) {
      return `You are already checked in for today's ${service.name || 'service'}.`;
    }

    // Record attendance
    await this.prisma.attendance.create({
      data: {
        church_id: msg.churchId,
        service_id: service.id,
        member_id: msg.memberId,
        checkin_at: new Date(),
        source: 'whatsapp',
      },
    });

    await this.audit.log({
      userId: msg.memberId,
      churchId: msg.churchId,
      entity: 'attendance',
      action: 'CREATE',
      entityId: service.id,
      newValues: { source: 'whatsapp', phone: msg.phone },
    });

    this.logger.log(`Check-in via WhatsApp: ${msg.phone} → ${service.name || 'service'}`);

    return `✅ You're checked in for ${service.name || "today's service"}! God bless you.`;
  }

  private async handleGive(msg: NormalizedMessage, _args: string): Promise<string> {
    const config = await this.prisma.churchConfig.findUnique({
      where: { church_id_key: { church_id: msg.churchId, key: 'giving_link' } },
    });

    const givingUrl = config?.value || this.config.get<string>('WEB_URL', '');

    return [
      '💰 *Giving Options*',
      '',
      'You can give via:',
      `🏦 Bank Transfer — Use your phone number as reference`,
      `🔗 Online — ${givingUrl}/give`,
      '📱 USSD — *737*000*Amount#',
      '',
      'For Cash giving, visit the church office.',
      'God loves a cheerful giver! 🙏',
    ].join('\n');
  }

  private async handlePrayer(msg: NormalizedMessage, args: string): Promise<string> {
    if (!msg.memberId) {
      return 'You are not registered as a member. Please visit our church to register for prayer requests.';
    }

    if (!args || args.trim().length === 0) {
      return 'Please type your prayer request after the command.\nExample: PRAYER Please pray for my family';
    }

    // Store prayer request as a pastoral note (simplified)
    await this.audit.log({
      userId: msg.memberId,
      churchId: msg.churchId,
      entity: 'prayer_request',
      action: 'CREATE',
      entityId: msg.memberId,
      newValues: { content: args, source: 'whatsapp', phone: msg.phone },
    });

    this.logger.log(`Prayer request from ${msg.phone}: ${args.substring(0, 50)}...`);

    return '🙏 Thank you for your prayer request. Our prayer team will stand with you in prayer. God hears and answers!';
  }

  private async handleEvents(msg: NormalizedMessage, _args: string): Promise<string> {
    const today = new Date();

    const events = await this.prisma.event.findMany({
      where: {
        church_id: msg.churchId,
        start_date: { gte: today },
      },
      orderBy: { start_date: 'asc' },
      take: 5,
    });

    if (events.length === 0) {
      return '📅 No upcoming events at this time. Check back later!';
    }

    const lines = ['📅 *Upcoming Events*', ''];
    for (const event of events) {
      const date = new Date(event.start_date).toLocaleDateString('en-NG', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      lines.push(`• *${event.title}* — ${date}`);
      if (event.description) {
        lines.push(`  ${event.description.substring(0, 80)}`);
      }
    }

    return lines.join('\n');
  }

  private async handleStatus(msg: NormalizedMessage, _args: string): Promise<string> {
    if (!msg.memberId) {
      return 'You are not registered as a member. Please visit our church to register.';
    }

    // Get attendance count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attendanceCount = await this.prisma.attendance.count({
      where: {
        member_id: msg.memberId,
        checkin_at: { gte: thirtyDaysAgo },
      },
    });

    // Get giving total (last 30 days)
    const givingResult = await this.prisma.transaction.aggregate({
      where: {
        member_id: msg.memberId,
        status: 'success',
        created_at: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
      _count: true,
    });

    const givingTotal = givingResult._sum.amount || 0;
    const givingCount = givingResult._count;

    return [
      '📊 *Your Status (Last 30 Days)*',
      '',
      `✅ Attendance: ${attendanceCount} service(s)`,
      `💰 Giving: ${givingCount} gift(s) — ₦${givingTotal.toLocaleString()}`,
    ].join('\n');
  }

  // ─── STATUS UPDATES ────────────────────────────────────────────

  private async handleStatusUpdates(
    statuses: { id: string; status: string; timestamp?: string }[],
  ): Promise<void> {
    for (const status of statuses) {
      try {
        await this.prisma.message.updateMany({
          where: {
            metadata: { path: ['wa_message_id'], equals: status.id },
          },
          data: { status: status.status },
        });
      } catch (err) {
        this.logger.warn(`Failed to update status for ${status.id}: ${(err as Error).message}`);
      }
    }
  }

  // ─── MAPPERS ───────────────────────────────────────────────────

  private mapMessageToDto(
    message: Record<string, unknown> & { id: string; created_at: Date },
  ): MessageResponseDto {
    return {
      messageId: message.id,
      churchId: message.church_id as string,
      memberId: (message.member_id as string) || undefined,
      phone: message.phone as string,
      direction: message.direction as string,
      channel: message.channel as string,
      content: (message.content as string) || undefined,
      mediaUrl: (message.media_url as string) || undefined,
      status: message.status as string,
      createdAt: message.created_at.toISOString(),
    };
  }
}
