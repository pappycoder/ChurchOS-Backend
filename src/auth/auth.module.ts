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
import { SupabaseModule } from '../supabase/supabase.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PermissionsModule } from './permissions.module';

/**
 * Auth module providing authentication infrastructure.
 *
 * Uses JWKS-based JWT verification via the `jose` library to support
 * Supabase's ES256 (ECDSA) signed tokens. No Passport dependency needed.
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
  imports: [SupabaseModule, PermissionsModule],
  controllers: [AuthController],
  providers: [JwksService, JwtAuthGuard, RateLimitGuard, AuthService],
  exports: [AuthService, JwtAuthGuard, JwksService, PermissionsModule],
})
export class AuthModule {}
