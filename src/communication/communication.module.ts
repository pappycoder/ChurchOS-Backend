/**
 * @file communication.module.ts
 * @description Multi-channel communication module.
 *
 * Provides provider-independent email, SMS and WhatsApp delivery services that log
 * outbound messages to the unified Message table. These services
 * are consumed by the BullMQ queue processors for async delivery.
 *
 * @module communication/communication.module
 * @since 1.0.0
 */

import { IntegrationAccountsModule } from '../integrations/integration-accounts.module';
import { Module } from '@nestjs/common';
import { EmailDeliveryService } from './email-delivery.service';
import { MessagingDeliveryService } from './messaging-delivery.service';

@Module({
  imports: [IntegrationAccountsModule],
  providers: [EmailDeliveryService, MessagingDeliveryService],
  exports: [EmailDeliveryService, MessagingDeliveryService, IntegrationAccountsModule],
})
export class CommunicationModule {}
