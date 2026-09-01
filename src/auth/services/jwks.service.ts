/**
 * @file jwks.service.ts
 * @description Service for fetching and caching Supabase Auth JWKS (JSON Web Key Set).
 *
 * Uses the `jose` library's `createRemoteJWKSet` to fetch and verify JWTs
 * against Supabase's public JWKS endpoint. Handles key caching and automatic
 * rotation when a new key ID is encountered.
 *
 * This is required because newer Supabase projects sign JWTs with ES256
 * (asymmetric ECDSA) instead of HS256 (symmetric HMAC). The old approach
 * of using `SUPABASE_JWT_SECRET` with passport-jwt no longer works.
 *
 * @module auth/services/jwks
 * @since 1.1.0
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';

/**
 * Result of a successful JWT verification.
 */
export interface JwtVerificationResult {
  /** Decoded JWT payload */
  payload: JWTPayload;
  /** The protected header (alg, kid, typ) */
  protectedHeader: Record<string, unknown>;
}

/**
 * Service that verifies Supabase Auth JWTs using their public JWKS endpoint.
 *
 * Supabase publishes its signing keys at:
 * `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
 *
 * The `jose` library's `createRemoteJWKSet` handles:
 * - Fetching the JWKS on first use
 * - Caching keys in memory
 * - Automatic re-fetch when an unknown key ID (kid) is encountered
 *
 * @example
 * ```typescript
 * const result = await this.jwks.verifyToken(accessToken);
 * console.log(result.payload.sub); // user UUID
 * ```
 */
@Injectable()
export class JwksService implements OnModuleInit {
  private readonly logger = new Logger(JwksService.name);
  private remoteJWKS!: JWTVerifyGetKey;

  constructor(private readonly config: ConfigService) {}

  /**
   * Initialize the remote JWKS endpoint on module init.
   *
   * Constructs the JWKS URL from the configured SUPABASE_URL:
   * `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
   */
  async onModuleInit(): Promise<void> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL must be set for JWKS verification');
    }

    // Dynamic import: load jose at runtime to avoid CommonJS/ESM conflicts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRemoteJWKSet } = await (eval('import("jose")') as Promise<typeof import('jose')>);
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
    this.remoteJWKS = createRemoteJWKSet(jwksUrl);
    this.logger.log(`JWKS endpoint initialized: ${jwksUrl.href}`);
  }

  /**
   * Verifies a JWT token against Supabase's JWKS.
   *
   * @param token - The raw JWT string to verify
   * @returns The decoded payload and protected header
   * @throws On any verification failure (expired, invalid signature, malformed, etc.)
   */
  async verifyToken(token: string): Promise<JwtVerificationResult> {
    try {
      // Dynamic import: load jose at runtime to avoid CommonJS/ESM conflicts
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { jwtVerify } = await (eval('import("jose")') as Promise<typeof import('jose')>);
      const result = await jwtVerify(token, this.remoteJWKS);

      return {
        payload: result.payload,
        protectedHeader: result.protectedHeader as Record<string, unknown>,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`JWT verification failed: ${message}`);
      throw error;
    }
  }
}
