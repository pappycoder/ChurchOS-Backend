/**
 * @file pastoral.module.ts
 * @description NestJS module for pastoral care management.
 *
 * Provides PastoralService, ScoringService, and PastoralController
 * for managing pastoral notes with AES-256-GCM encryption, member
 * engagement/risk scoring, and confidentiality access control.
 *
 * @module pastoral/pastoral.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PastoralService } from './pastoral.service';
import { ScoringService } from './scoring.service';
import { PastoralController } from './pastoral.controller';

@Module({
  // Import AuthModule to access JWT guards and role decorators
  imports: [AuthModule],
  // Register the PastoralController for HTTP endpoint routing
  controllers: [PastoralController],
  // Register PastoralService and ScoringService as injectable providers
  providers: [PastoralService, ScoringService],
  // Export services so other modules (e.g., BullMQ processors) can inject them
  exports: [PastoralService, ScoringService],
})
export class PastoralModule {}
