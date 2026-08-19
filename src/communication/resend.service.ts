/**
 * @file resend.service.ts
 * @description Email delivery service using the Resend API.
 *
 * Provides a sendEmail() method that sends HTML emails via Resend and
 * logs every outbound message to the Prisma Message model with
 * channel: 'email'. This ensures all communications are tracked
 * in the unified message history.
 *
 * Requires RESEND_API_KEY environment variable.
 *
 * @module communication/resend.service
 * @since 1.0.0
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Sends an HTML email via Resend and logs it to the Message table.
   *
   * @param to - Recipient email address
   * @param subject - Email subject line
   * @param html - HTML email body
   * @param churchId - Church ID for tenant scoping and message logging
   * @returns The created Message record ID
   * @throws InternalServerErrorException if Resend API is not configured or send fails
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    churchId: string,
    attachment?: EmailAttachment,
  ): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const fromAddress = this.config.get<string>('RESEND_FROM', 'noreply@churchos.app');

    if (!apiKey) {
      throw new InternalServerErrorException('Resend API not configured');
    }

    try {
      const payload: Record<string, unknown> = {
        from: fromAddress,
        to: [to],
        subject,
        html,
      };

      if (attachment) {
        payload.attachments = [
          {
            filename: attachment.filename,
            content: attachment.content.toString('base64'),
          },
        ];
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Resend API error: ${response.status} ${error}`);
        throw new InternalServerErrorException('Failed to send email');
      }

      const result = (await response.json()) as { id: string };

      const message = await this.prisma.message.create({
        data: {
          church_id: churchId,
          phone: to,
          direction: 'outbound' as never,
          channel: 'email',
          content: subject,
          status: 'sent',
          metadata: { resend_id: result.id, subject } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`Email sent to ${to}: ${subject} (${result.id})`);
      return message.id;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error(`Email send error: ${(err as Error).message}`);
      throw new InternalServerErrorException('Failed to send email');
    }
  }
}
