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

@Global()
@Module({
  imports: [AuthModule, CommunicationModule, WhatsAppModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
