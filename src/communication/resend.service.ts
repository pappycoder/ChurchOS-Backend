/**
 * @file resend.service.ts
 * @description Email delivery service using the Resend API.
 *
 * Provides a sendEmail() method that sends HTML emails via Resend and
 * logs church-owned outbound messages to the Prisma Message model with
 * channel: 'email'. This ensures all communications are tracked
 * in the unified message history.
 *
 * Resolves church credentials or platform RESEND_API_KEY. Platform authentication
 * emails have no tenant Message row.
 *
 * @module communication/resend.service
 * @since 1.0.0
 */

import { MessagingCredentialsService } from '../messaging-integrations/messaging-credentials.service';
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { INTEGRATION_ALERT_SERVICE_TOKEN } from '../notifications/notification-tokens';

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
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
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly credentials: MessagingCredentialsService,
  ) {}

  /**
   * Lazily resolves the integration alert service and raises a bell alert to
   * the church's admins. Failures are swallowed so alerting can never break
   * the underlying email send.
   */
  private async notifyFailure(churchId: string, subject: string, message: string): Promise<void> {
    try {
      this.alertService ??= this.moduleRef.get(INTEGRATION_ALERT_SERVICE_TOKEN, {
        strict: false,
      });
      if (!this.alertService) return;
      await this.alertService.notify(
        churchId,
        'resend',
        'Resend email delivery failed',
        `${subject}. ${message}`,
      );
    } catch (err) {
      this.logger.warn(`Resend failure alert skipped: ${err instanceof Error ? err.message : err}`);
    }
  }

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
    const { apiKey, from: fromAddress } = await this.credentials.resolve(churchId, 'resend');

    if (!apiKey) {
      await this.notifyFailure(churchId, 'Email not delivered', 'Resend API not configured.');
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
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(`Resend API error: ${response.status}`);
        await this.notifyFailure(churchId, 'Email not delivered', `HTTP ${response.status}.`);
        throw new InternalServerErrorException('Failed to send email');
      }

      const result = (await response.json()) as { id: string };

      if (!result.id)
        throw new InternalServerErrorException('Resend did not confirm message acceptance');
      // Platform sign-in/recovery emails have no tenant and cannot create a church-owned row.
      if (!churchId) return result.id;

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
      this.logger.error(`Email send error: provider request failed`);
      await this.notifyFailure(churchId, 'Email not delivered', 'Provider request failed.');
      throw new InternalServerErrorException('Failed to send email');
    }
  }
}
