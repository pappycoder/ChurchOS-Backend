/**
 * @file jwt-auth.guard.ts
 * @description Guard that protects routes with Supabase JWT validation.
 *
 * Extracts and verifies the JWT from the Authorization header using
 * Supabase's public JWKS endpoint (ES256). On success, the decoded
 * user payload is attached to `request.user`.
 *
 * @module auth/guards/jwt-auth.guard
 * @since 1.0.0
 */

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/decorators/current-user.decorator';
import { errors } from 'jose';
import { JwksService } from '../services/jwks.service';
import { SupabaseJwtPayload } from '../strategies/jwt.strategy';
import { AuthenticatorService } from '../services/authenticator.service';
import { RedisService } from '../../redis/redis.service';

/**
 * JWT authentication guard for Supabase Auth tokens.
 *
 * Uses the `jose` library to verify JWTs against Supabase's remote JWKS.
 * Supports the configured Supabase asymmetric signing keys.
 *
 * Apply to any route that requires a valid JWT:
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: SupabaseJwtPayload) {
 *   return user;
 * }
 * ```
 */
@Injectable()
export class JwtAuthGuard {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwksService: JwksService,
    private readonly redis: RedisService,
    private readonly authenticator: AuthenticatorService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    const verification = request.verifiedJwt
      ? Promise.resolve({ payload: request.verifiedJwt })
      : this.jwksService.verifyToken(token);
    return verification
      .then(async ({ payload }) => {
        if (!payload.sub) {
          throw new UnauthorizedException('Invalid token: missing subject claim');
        }

        // Check if token has been blacklisted (logged out)
        // Fail-open: if Redis is unreachable the blacklist lookup errors and we
        // treat the token as valid rather than rejecting every request.
        let isBlacklisted: unknown = null;
        try {
          isBlacklisted = await this.redis.get(`auth:blacklist:${token}`);
        } catch (err) {
          this.logger.warn(
            `Blacklist lookup skipped (Redis unavailable): ${err instanceof Error ? err.message : err}`,
          );
        }
        if (isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }

        await this.authenticator.assertSession(payload, request.profile);

        // Map JWT payload to SupabaseJwtPayload
        // Include both `sub` and `id` (mapped from sub) for compatibility
        const user: SupabaseJwtPayload = {
          id: payload.sub,
          sub: payload.sub,
          email: payload.email as string | undefined,
          phone: payload.phone as string | undefined,
          app_metadata: (payload.app_metadata as Record<string, unknown>) || {},
          user_metadata: (payload.user_metadata as Record<string, unknown>) || {},
          role: payload.role as string | undefined,
          iat: payload.iat,
          exp: payload.exp,
        };

        // Attach to request.user for @CurrentUser() and downstream middleware
        (request as unknown as { user: SupabaseJwtPayload }).user = user;

        return true;
      })
      .catch((error) => {
        if (error instanceof HttpException) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`JWT verification failed: ${message}`);
        if (error instanceof errors.JOSEError) {
          throw new UnauthorizedException('Invalid or expired token');
        }
        throw new ServiceUnavailableException('Unable to verify your session. Please try again.');
      });
  }
}
