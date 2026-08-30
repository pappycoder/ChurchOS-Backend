/**
 * @file appointments.module.ts
 * @description Appointment / booking registry module.
 *
 * @module appointments/appointments.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

/**
 * Module for the appointment/booking registry (secretary ↔ pastor).
 * Imports AuthModule for JWT authentication. AuditLoggingService and
 * PrismaService are global and need no explicit import here.
 */
@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
