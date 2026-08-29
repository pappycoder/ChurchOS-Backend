/**
 * @file notifications.module.ts
 * @description In-app notification management module.
 *
 * @module notifications/notifications.module
 * @since 1.0.0
 */

import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_SERVICE_TOKEN } from './notification-tokens';

@Global()
@Module({
  imports: [AuthModule, CommunicationModule, WhatsAppModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    // Named-token alias so `AuditLoggingService` can resolve the same instance
    // lazily through `ModuleRef` without a circular file-level import.
    { provide: NOTIFICATIONS_SERVICE_TOKEN, useExisting: NotificationsService },
  ],
  exports: [NotificationsService, NOTIFICATIONS_SERVICE_TOKEN],
})
export class NotificationsModule {}
