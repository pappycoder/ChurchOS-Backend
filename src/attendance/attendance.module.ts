/**
 * @file attendance.module.ts
 * @description NestJS module for attendance and service management.
 *
 * Registers the AttendanceController and AttendanceService.
 * Imports AuthModule for JwtAuthGuard dependency.
 *
 * @module attendance/attendance.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
