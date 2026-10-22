import { CompanyEmailModule } from '../company-email/company-email.module';
/**
 * @file profile.module.ts
 * @description Profile management module for user profiles, photo uploads, and role management.
 *
 * @module profile/profile.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { RedisModule } from '../redis/redis.module';
import { CommunicationModule } from '../communication/communication.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * Profile module providing user profile management.
 *
 * Handles profile CRUD, avatar uploads (via MediaService), role management,
 * and profile listing with multi-tenant scoping.
 *
 * @example
 * ```typescript
 * // Import in AppModule:
 * @Module({
 *   imports: [ProfileModule],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [CompanyEmailModule, AuthModule, MediaModule, RedisModule, CommunicationModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
