/**
 * @file webhooks.module.ts
 * @description Outbound webhook management module.
 *
 * @module webhooks/webhooks.module
 * @since 1.0.0
 */

import { Module, OnModuleDestroy, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthModule } from '../auth/auth.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: 'webhook-delivery' })],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule implements OnModuleDestroy {
  private readonly logger = new Logger(WebhooksModule.name);

  constructor(@InjectQueue('webhook-delivery') private readonly webhookDeliveryQueue: Queue) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing webhook-delivery queue connection...');
    await this.webhookDeliveryQueue.close();
    this.logger.log('Webhook-delivery queue connection closed');
  }
}
