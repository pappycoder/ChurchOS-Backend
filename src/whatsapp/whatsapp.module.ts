/**
 * @file whatsapp.module.ts
 * @description WhatsApp messaging module using church-specific provider accounts.
 *
 * @module whatsapp/whatsapp.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp module providing webhook handling, command routing, and message sending.
 */
@Module({
  imports: [AuthModule, CommunicationModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
