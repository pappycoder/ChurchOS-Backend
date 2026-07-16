/**
 * @file jwt.strategy.ts
 * @description Type definitions for Supabase JWT payload.
 *
 * Previously contained the Passport JWT strategy, now replaced by
 * a standalone guard (jwt-auth.guard.ts) using `jose` JWKS verification.
 *
 * @module auth/strategies/jwt.strategy
 * @since 1.0.0
 */

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
