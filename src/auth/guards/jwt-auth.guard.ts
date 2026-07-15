/**
 * @file jwt-auth.guard.ts
 * @description Guard that protects routes with Supabase JWT validation.
 *
 * Uses Passport's AuthGuard('jwt') under the hood to extract and verify
 * the Bearer token from the Authorization header. On success, the decoded
 * user payload is attached to `request.user`.
 *
 * @module auth/guards/jwt-auth.guard
 * @since 1.0.0
 */

import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { Request } from 'express';

/**
 * JWT authentication guard for Supabase Auth tokens.
 *
 * Apply to any route that requires a valid JWT:
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: { sub: string; email: string }) {
 *   return user;
 * }
 * ```
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    return super.canActivate(context);
  }

  /**
   * Handles authentication failures from Passport.
   */
  handleRequest<TUser = unknown>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
