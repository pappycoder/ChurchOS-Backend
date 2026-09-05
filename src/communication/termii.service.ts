/**
 * @file termii.service.ts
 * @description Unified messaging delivery service using the Termii API.
 *
 * Termii is the single platform for ChurchOS WhatsApp + SMS. This service
 * owns every outbound Termii API call:
 *   - sendSms()              → plain SMS (channel: 'generic')
 *   - sendWhatsAppMessage()  → conversational WhatsApp (channel: 'whatsapp')
 *   - sendWhatsAppTemplate() → approved WhatsApp template (Template API)
 *
 * sendSms() also persists the outbound SMS to the Prisma Message model
 * (channel: 'sms'). WhatsApp messages are persisted by WhatsAppService.
 *
 * Requires TERMII_API_KEY, TERMII_WHATSAPP_DEVICE_ID (WhatsApp device),
 * and optionally TERMII_FROM (SMS sender ID) env vars.
 *
 * @module communication/termii.service
 * @since 1.0.0
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { INTEGRATION_ALERT_SERVICE_TOKEN } from '../notifications/notification-tokens';

interface TermiiSendResult {
  requestId?: string;
}

@Injectable()
export class TermiiService {
  private readonly logger = new Logger(TermiiService.name);
  private alertService?: {
    notify(
      churchId: string,
      integration: string,
      title: string,
      message: string,
      data?: Record<string, unknown>,
    ): Promise<void>;
  };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Lazily resolves the integration alert service and raises a bell alert to
   * the church's admins. Failures are swallowed so alerting can never break
   * the underlying Termii send.
   */
  private async notifyFailure(churchId: string, title: string, message: string): Promise<void> {
    try {
      this.alertService ??= this.moduleRef.get(INTEGRATION_ALERT_SERVICE_TOKEN, {
        strict: false,
      });
      if (!this.alertService) return;
      await this.alertService.notify(churchId, 'termii', title, message);
    } catch (err) {
      this.logger.warn(`Termii failure alert skipped: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Sends an SMS via Termii and logs it to the Message table.
   *
   * @param to - Recipient phone number (with country code, e.g. +234...)
   * @param message - SMS text content
   * @param churchId - Church ID for tenant scoping and message logging
   * @param parentMessageId - Optional ID of the original message this SMS is a fallback for
   * @returns The created Message record ID
   * @throws InternalServerErrorException if Termii API is not configured or send fails
   */
  async sendSms(
    to: string,
    message: string,
    churchId: string,
    parentMessageId?: string,
  ): Promise<string> {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    const from = this.config.get<string>('TERMII_FROM', 'ChurchOS');

    if (!apiKey) {
      await this.notifyFailure(churchId, 'SMS not delivered', 'Termii API not configured.');
      throw new InternalServerErrorException('Termii API not configured');
    }

    try {
      const response = await fetch('https://api.termii.com/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          to: to.replace('+', ''),
          from,
          sms: message,
          type: 'plain',
          channel: 'generic',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Termii API error: ${response.status} ${error}`);
        await this.notifyFailure(churchId, 'SMS not delivered', `HTTP ${response.status}.`);
        throw new InternalServerErrorException('Failed to send SMS');
      }

      const result = (await response.json()) as { request_id?: string; message?: string };

      const msg = await this.prisma.message.create({
        data: {
          church_id: churchId,
          phone: to,
          direction: 'outbound' as never,
          channel: 'sms',
          fallback_channel: 'sms',
          parent_message_id: parentMessageId ?? null,
          content: message,
          status: 'sent',
          metadata: { termii_request_id: result.request_id } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`SMS sent to ${to} (${result.request_id ?? 'unknown'})`);
      return msg.id;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`SMS send error: ${(err as Error).message}`);
      await this.notifyFailure(churchId, 'SMS not delivered', (err as Error).message);
      throw new InternalServerErrorException('Failed to send SMS');
    }
  }

  /**
   * Sends a conversational WhatsApp message via Termii.
   *
   * Uses the Termii Messaging API with `channel: 'whatsapp'` and the
   * configured WhatsApp device ID as the sender. No Message row is created
   * here — WhatsAppService persists the outbound message.
   *
   * @param to - Recipient phone number (with country code, e.g. +234...)
   * @param message - WhatsApp text content
   * @returns Request ID assigned by Termii, if any
   * @throws InternalServerErrorException if Termii / WhatsApp is not configured or send fails
   */
  async sendWhatsAppMessage(to: string, message: string): Promise<TermiiSendResult> {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    const deviceId = this.config.get<string>('TERMII_WHATSAPP_DEVICE_ID');

    if (!apiKey) {
      throw new InternalServerErrorException('Termii API not configured');
    }
    if (!deviceId) {
      throw new InternalServerErrorException('Termii WhatsApp device not configured');
    }

    try {
      const response = await fetch('https://api.termii.com/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          to: to.replace('+', ''),
          from: deviceId,
          sms: message,
          type: 'plain',
          channel: 'whatsapp',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Termii WhatsApp API error: ${response.status} ${error}`);
        throw new InternalServerErrorException('Failed to send WhatsApp message');
      }

      const result = (await response.json()) as { request_id?: string; message?: string };
      this.logger.log(`WhatsApp sent to ${to} (${result.request_id ?? 'unknown'})`);
      return { requestId: result.request_id };
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`WhatsApp send error: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to send WhatsApp message');
    }
  }

  /**
   * Sends an approved WhatsApp template message via the Termii WhatsApp
   * Template API.
   *
   * Template messages are required for any outbound WhatsApp message outside
   * the 24-hour conversational window. The template must be pre-approved and
   * registered on the Termii device (subscription page).
   *
   * @param to - Recipient phone number (international format, e.g. 234...)
   * @param templateId - Termii template ID (from the device subscription page)
   * @param variables - Key-value data to populate template placeholders
   * @returns Request ID assigned by Termii, if any
   * @throws InternalServerErrorException if Termii / WhatsApp is not configured or send fails
   */
  async sendWhatsAppTemplate(
    to: string,
    templateId: string,
    variables?: Record<string, string>,
  ): Promise<TermiiSendResult> {
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    const deviceId = this.config.get<string>('TERMII_WHATSAPP_DEVICE_ID');

    if (!apiKey) {
      throw new InternalServerErrorException('Termii API not configured');
    }
    if (!deviceId) {
      throw new InternalServerErrorException('Termii WhatsApp device not configured');
    }

    try {
      const response = await fetch('https://api.termii.com/api/send/template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          phone_number: to.replace('+', ''),
          device_id: deviceId,
          template_id: templateId,
          data: variables ?? {},
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Termii WhatsApp template API error: ${response.status} ${error}`);
        throw new InternalServerErrorException('Failed to send WhatsApp template message');
      }

      const result = (await response.json()) as { request_id?: string; message?: string };
      this.logger.log(`WhatsApp template sent to ${to} (${result.request_id ?? 'unknown'})`);
      return { requestId: result.request_id };
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`WhatsApp template send error: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to send WhatsApp template message');
    }
  }
}
