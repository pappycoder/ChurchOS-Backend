/**
 * @file auth.module.ts
 * @description Authentication module providing JWT guard and Supabase Auth integration.
 *
 * Imports the Passport module and registers the JwtStrategy so that
 * JwtAuthGuard can be used on any protected route.
 *
 * @module auth/auth.module
 * @since 1.0.0
 */

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';

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
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
