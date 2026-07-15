/**
 * @file auth.module.ts
 * @description Authentication module providing JWT guard, Supabase Auth integration,
 * registration, and profile management.
 *
 * @module auth/auth.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../supabase/supabase.module';

/**
 * Auth module providing authentication infrastructure.
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
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), SupabaseModule],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
