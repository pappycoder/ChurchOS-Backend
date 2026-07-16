/**
 * @file jwt.strategy.ts
 * @description Passport JWT strategy for validating Supabase Auth ES256 tokens.
 *
 * Uses the `jose` library to verify JWTs against Supabase's public JWKS endpoint.
 * This replaces the previous passport-jwt HMAC approach which only supported HS256.
 *
 * Newer Supabase projects sign JWTs with ES256 (asymmetric ECDSA), requiring
 * verification via the remote JWKS rather than a shared secret.
 *
 * @module auth/strategies/jwt.strategy
 * @since 1.0.0
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport';
import { Request } from 'express';
import { JWTPayload } from 'jose';
import { JwksService } from '../services/jwks.service';

/**
 * Decoded JWT payload from Supabase Auth.
 */
export interface SupabaseJwtPayload {
  /** Supabase user ID (UUID) — mapped from `sub` for compatibility with SupabaseUser interface */
  id: string;
  /** Supabase user ID (UUID) from the `sub` claim */
  sub: string;
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
  /** App metadata (provider, providers) */
  app_metadata: Record<string, unknown>;
  /** User metadata (name, avatar, etc.) */
  user_metadata: Record<string, unknown>;
  /** Role claim (typically "authenticated") */
  role?: string;
  /** Issued at (unix timestamp) */
  iat?: number;
  /** Expiration (unix timestamp) */
  exp?: number;
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}

/**
 * Passport strategy that validates Supabase Auth ES256 tokens via JWKS.
 *
 * Instead of using `passport-jwt` with HMAC secret verification, this strategy:
 * 1. Extracts the Bearer token from the Authorization header
 * 2. Verifies the token against Supabase's remote JWKS using `jose`
 * 3. Maps the JWT payload to a `SupabaseJwtPayload` attached to `request.user`
 *
 * This approach works with both ES256 (new Supabase) and HS256 (legacy) tokens,
 * as the JWKS endpoint provides the appropriate keys for the project.
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
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly jwksService: JwksService) {
    super();
  }

  /**
   * Passport authenticate callback — verifies the JWT using JWKS.
   *
   * @param request - The incoming HTTP request
   */
  async authenticate(request: Request): Promise<void> {
    const token = extractTokenFromHeader(request);

    if (!token) {
      return this.fail('Missing or invalid Authorization header', 401);
    }

    try {
      const { payload } = await this.jwksService.verifyToken(token);

      if (!payload.sub) {
        return this.fail('Invalid token: missing subject claim', 401);
      }

      // Pass the raw JWT payload to success() — validate() will map it
      return this.success(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.fail(`Invalid or expired token: ${message}`, 401);
    }
  }

  /**
   * Validates the decoded JWT payload.
   *
   * Called automatically by Passport after successful token verification
   * in authenticate(). Maps the raw JWT payload to SupabaseJwtPayload.
   *
   * @param payload - Decoded JWT payload from jose verification
   * @returns The validated user payload attached to request.user
   */
  validate(payload: JWTPayload): SupabaseJwtPayload {
    return {
      id: payload.sub as string,
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      phone: payload.phone as string | undefined,
      app_metadata: (payload.app_metadata as Record<string, unknown>) || {},
      user_metadata: (payload.user_metadata as Record<string, unknown>) || {},
      role: payload.role as string | undefined,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
