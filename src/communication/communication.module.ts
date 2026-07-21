/**
 * @file communication.module.ts
 * @description Multi-channel communication module.
 *
 * Provides email (Resend) and SMS (Termii) services that log all
 * outbound messages to the unified Message table. These services
 * are consumed by the BullMQ queue processors for async delivery.
 *
 * @module communication/communication.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { ResendService } from './resend.service';
import { TermiiService } from './termii.service';

@Module({
  providers: [ResendService, TermiiService],
  exports: [ResendService, TermiiService],
})
export class CommunicationModule {}
