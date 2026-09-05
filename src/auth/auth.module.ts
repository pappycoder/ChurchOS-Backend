/**
 * @file auth.module.ts
 * @description Authentication module providing JWT guard, Supabase Auth integration,
 * registration, and profile management.
 *
 * @module auth/auth.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwksService } from './services/jwks.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PermissionsController } from './permissions.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PermissionsModule } from './permissions.module';
import { CommunicationModule } from '../communication/communication.module';

/**
 * Auth module providing authentication infrastructure.
 *
 * Uses JWKS-based JWT verification via the `jose` library to support
 * Supabase's ES256 (ECDSA) signed tokens. No Passport dependency needed.
 *
 * Also registers PermissionsController since it depends on JwtAuthGuard
 * which is provided here. PermissionsModule only provides PermissionsService.
 *
 * @example
 * ```typescript
 * // In any feature module that needs protected routes:
 * @Module({
 *   imports: [AuthModule],
 *   ...
 * })
 * export class MembersModule {}
 * ```
 */
@Module({
  imports: [SupabaseModule, PermissionsModule, CommunicationModule],
  controllers: [AuthController, PermissionsController],
  providers: [JwksService, JwtAuthGuard, RateLimitGuard, AuthService],
  exports: [AuthService, JwtAuthGuard, JwksService, PermissionsModule],
})
export class AuthModule {}
