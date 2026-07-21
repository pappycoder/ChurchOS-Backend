/**
 * @file whatsapp.module.ts
 * @description WhatsApp Business API integration module.
 *
 * @module whatsapp/whatsapp.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp module providing webhook handling, command routing, and message sending.
 */
@Module({
  imports: [AuthModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
