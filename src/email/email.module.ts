/**
 * @file email.module.ts
 * @description Internal in-app email module.
 *
 * @module email/email.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

/**
 * Module for internal in-app email messaging.
 * Imports AuthModule for JWT authentication. AuditLoggingService and
 * PrismaService are global and need no explicit import here.
 */
@Module({
  imports: [AuthModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
