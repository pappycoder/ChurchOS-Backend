/**
 * @file jwks.service.ts
 * @description Service for fetching and caching Supabase Auth JWKS (JSON Web Key Set).
 *
 * Uses the `jose` library's `createRemoteJWKSet` to fetch and verify JWTs
 * against Supabase's public JWKS endpoint.
 *
 * @module auth/services/jwks
 * @since 1.1.0
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

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
 */
@Injectable()
export class JwksService implements OnModuleInit {
  private readonly logger = new Logger(JwksService.name);

  private remoteJWKS!: JWTVerifyGetKey;

  constructor(private readonly config: ConfigService) {}

  /**
   * Initialize the remote JWKS endpoint on module init.
   */
  async onModuleInit(): Promise<void> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL must be set for JWKS verification');
    }

    const jwksUrl = new URL(
      '/auth/v1/.well-known/jwks.json',
      supabaseUrl,
    );

    this.remoteJWKS = createRemoteJWKSet(jwksUrl);

    this.logger.log(`JWKS endpoint initialized: ${jwksUrl.href}`);
  }

  /**
   * Verifies a JWT token against Supabase's JWKS.
   *
   * @param token - The raw JWT string to verify
   * @returns The decoded payload and protected header
   */
  async verifyToken(token: string): Promise<JwtVerificationResult> {
    try {
      const result = await jwtVerify(token, this.remoteJWKS);

      return {
        payload: result.payload,
        protectedHeader: result.protectedHeader as Record<string, unknown>,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(`JWT verification failed: ${message}`);

      throw error;
    }
  }
}
