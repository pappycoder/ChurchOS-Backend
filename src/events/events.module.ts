/**
 * @file events.module.ts
 * @description Events module for event management, registration, and ticketing.
 *
 * Imports GivingModule for payment gateway access (paid ticketing).
 *
 * @module events/events.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GivingModule } from '../giving/giving.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * Events module providing event CRUD, registration, capacity tracking,
 * paid ticketing with multi-tier support, and ticket validation.
 */
@Module({
  imports: [AuthModule, GivingModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
