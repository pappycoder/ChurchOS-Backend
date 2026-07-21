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
  // Step 1: Import AuthModule to access JWT guards and role decorators
  imports: [AuthModule],
  // Step 2: Register the PastoralController for HTTP endpoint routing
  controllers: [PastoralController],
  // Step 3: Register PastoralService and ScoringService as injectable providers
  providers: [PastoralService, ScoringService],
  // Step 4: Export services so other modules (e.g., BullMQ processors) can inject them
  exports: [PastoralService, ScoringService],
})
export class PastoralModule {}
