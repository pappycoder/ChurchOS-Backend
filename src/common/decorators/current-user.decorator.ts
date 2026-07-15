import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Interface representing the authenticated Supabase user.
 * Extracted from the JWT token after verification by SupabaseAuthGuard.
 */
export interface SupabaseUser {
  /** Supabase Auth user ID (UUID) */
  id: string;
  /** User's email address */
  email?: string;
  /** User's phone number */
  phone?: string;
  /** User's full name (if set) */
  full_name?: string;
  /** User's avatar URL (if set) */
  avatar_url?: string;
}

/**
 * Interface representing the full request with authenticated user context.
 * The SupabaseAuthGuard attaches `user` and `profile` to the request.
 */
export interface AuthenticatedRequest extends Request {
  /** The authenticated Supabase user */
  user: SupabaseUser;
  /** The user's ChurchOS profile (role, church_id, branch_id) */
  profile?: {
    id: string;
    church_id: string;
    branch_id?: string;
    role: string;
    permissions?: string[];
  };
}

/**
 * Parameter decorator to extract the authenticated user from the request.
 *
 * Can extract the full user object or a specific property.
 *
 * @param data - Optional property name to extract (e.g., 'id', 'email')
 * @returns The authenticated user or the specified property
 *
 * @example
 * ```typescript
 * // Get full user object
 * @Get('profile')
 * async getProfile(@CurrentUser() user: SupabaseUser) {
 *   return user;
 * }
 *
 * // Get just the user ID
 * @Get('profile')
 * async getProfile(@CurrentUser('id') userId: string) {
 *   return userId;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof SupabaseUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);

/**
 * Parameter decorator to extract the authenticated user's profile from the request.
 *
 * The profile contains church-specific context: church_id, branch_id, role, permissions.
 * This is populated by the SupabaseAuthGuard after verifying the JWT and fetching
 * the user's profile from the database.
 *
 * @param data - Optional property name to extract (e.g., 'church_id', 'role')
 * @returns The user's profile or the specified property
 *
 * @example
 * ```typescript
 * // Get full profile
 * @Get('church-data')
 * async getChurchData(@CurrentUserProfile() profile: UserProfile) {
 *   return profile;
 * }
 *
 * // Get just the church_id
 * @Get('church-data')
 * async getChurchData(@CurrentUserProfile('church_id') churchId: string) {
 *   return churchId;
 * }
 * ```
 */
export const CurrentUserProfile = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const profile = request.profile;

    if (!profile) {
      return null;
    }

    return data ? (profile as Record<string, unknown>)[data] : profile;
  },
);
