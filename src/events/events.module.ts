/**
 * @file events.module.ts
 * @description Events module for event management and registration.
 *
 * @module events/events.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * Events module providing event CRUD, registration, and capacity tracking.
 */
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
