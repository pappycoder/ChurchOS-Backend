/**
 * @file webhook-delivery.processor.ts
 * @description BullMQ processor for outbound webhook delivery.
 *
 * Signs payloads with HMAC-SHA256 and delivers via HTTP POST.
 * Updates WebhookDelivery record with result.
 *
 * @module webhooks/webhook-delivery.processor
 * @since 1.0.0
 */

import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { createHmac } from 'crypto';

interface WebhookDeliveryJob {
  deliveryId: string;
  subscriptionId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('deliver')
  async handleDelivery(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { deliveryId, url, secret, event, payload } = job.data;

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { attempts: { increment: 1 } },
    });

    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text().catch(() => '');

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: HTTP ${response.status} - ${responseBody.slice(0, 500)}`,
      );
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'success',
        response_status: response.status,
        response_body: responseBody.slice(0, 2000),
      },
    });
  }

  @OnQueueFailed()
  async onFailed(job: Job<WebhookDeliveryJob>, error: Error): Promise<void> {
    this.logger.error(`Webhook delivery failed: ${job.data.deliveryId} — ${error.message}`);

    await this.prisma.webhookDelivery
      .update({
        where: { id: job.data.deliveryId },
        data: {
          status: 'failed',
          response_body: error.message.slice(0, 2000),
        },
      })
      .catch((err) => this.logger.error(`Failed to update delivery status: ${err.message}`));
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<WebhookDeliveryJob>): Promise<void> {
    this.logger.log(`Webhook delivered: ${job.data.event} → ${job.data.url}`);
  }
}
