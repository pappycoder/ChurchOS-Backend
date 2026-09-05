/**
 * @file broadcast.module.ts
 * @description Broadcast messaging module.
 *
 * Provides BroadcastService and BroadcastController for creating and managing
 * broadcast campaigns across WhatsApp, SMS, and Email channels.
 *
 * @module broadcast/broadcast.module
 * @since 1.0.0
 */

import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueuesModule } from '../queues/queues.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

@Module({
  imports: [AuthModule, forwardRef(() => QueuesModule)],
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
