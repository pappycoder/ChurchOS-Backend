/**
 * @file templates.module.ts
 * @description Message template management module.
 *
 * Provides TemplatesService and TemplatesController for managing reusable
 * message templates across WhatsApp, SMS, and Email channels.
 * Imports AuthModule for JWT authentication.
 *
 * @module templates/templates.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
