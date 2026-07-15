/**
 * @file jwt.strategy.ts
 * @description Passport JWT strategy for validating Supabase Auth tokens.
 *
 * Extracts and verifies the JWT from the Authorization header using
 * Supabase's JWT secret (obtained from the Supabase project settings).
 * On success, attaches the decoded user payload to the request.
 *
 * @module auth/strategies/jwt.strategy
 * @since 1.0.0
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Decoded JWT payload from Supabase Auth.
 */
export interface SupabaseJwtPayload {
  /** Supabase user ID (UUID) */
  sub: string;
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
  /** App metadata (role, etc.) */
  app_metadata: Record<string, unknown>;
  /** User metadata (name, avatar, etc.) */
  user_metadata: Record<string, unknown>;
  /** Role claim */
  role?: string;
  /** Issued at (unix timestamp) */
  iat: number;
  /** Expiration (unix timestamp) */
  exp: number;
}

/**
 * JWT strategy that validates Supabase Auth tokens.
 *
 * Uses passport-jwt to extract and verify the Bearer token from the
 * Authorization header. The JWT secret must match the one configured
 * in the Supabase project settings (Settings → API → JWT Secret).
 *
 * @example
 * ```typescript
 * // On protected routes:
 * @UseGuards(JwtAuthGuard)
 * @Get('members')
 * findAll(@CurrentUser() user: SupabaseJwtPayload) {
 *   return this.membersService.findAll(user.sub);
 * }
 * ```
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const jwtSecret = config.get<string>('SUPABASE_JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET must be set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  /**
   * Validates the decoded JWT payload.
   *
   * Called automatically by Passport after successful token verification.
   * The returned object is attached to `request.user`.
   *
   * @param payload - Decoded JWT payload
   * @returns The validated user payload
   * @throws UnauthorizedException if the token is invalid
   */
  validate(payload: SupabaseJwtPayload): SupabaseJwtPayload {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      phone: payload.phone,
      app_metadata: payload.app_metadata,
      user_metadata: payload.user_metadata,
      role: payload.role,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
