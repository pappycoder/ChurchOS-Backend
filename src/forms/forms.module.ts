/**
 * @file forms.module.ts
 * @description NestJS module for form and submission management.
 *
 * Provides FormsService, FormsController, and FormsPublicController for
 * managing form definitions, templates, submissions, and approvals.
 *
 * @module forms/forms.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormsController } from './forms.controller';
import { FormsPublicController } from './forms-public.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, FormsPublicController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
