/**
 * @file termii.service.ts
 * @description SMS delivery service using the Termii API.
 *
 * Provides a sendSms() method that sends SMS via Termii and logs every
 * outbound message to the Prisma Message model with channel: 'sms'.
 * Uses the Termii REST API with API key authentication.
 *
 * Requires TERMII_API_KEY and optionally TERMII_FROM (sender ID) env vars.
 *
 * @module communication/termii.service
 * @since 1.0.0
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TermiiService {
  private readonly logger = new Logger(TermiiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
      throw new InternalServerErrorException('Failed to send SMS');
    }
  }
}
