/**
 * @file request-context.middleware.ts
 * @description Middleware that populates RequestContext from the authenticated request.
 *
 * Runs on every request at the Express layer (before NestJS guards).
 * Extracts the Bearer token, decodes it (without verification — the guard
 * handles that) to get the user's Supabase ID, then looks up the Profile
 * from the database to get church_id/branch_id/role. Attaches both user
 * and profile to the request so downstream guards, controllers, and the
 * RequestContextService all have access to the tenant context.
 *
 * @module common/middleware/request-context
 * @since 1.0.0
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { decodeJwt } from 'jose';
import { RequestContextService } from '../services/request-context.service';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseJwtPayload } from '../../auth/strategies/jwt.strategy';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authReq = req as AuthenticatedRequest;

    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);
    if (!token) {
      next();
      return;
    }

    // Decode (not verify) the JWT to get the user's Supabase ID early.
    // The JwtAuthGuard will fully verify the token later.
    let sub: string;
    try {
      const payload = decodeJwt(token);
      sub = payload.sub ?? '';
      if (!sub) {
        next();
        return;
      }
    } catch {
      next();
      return;
    }

    // Set minimal user info — JwtAuthGuard will overwrite with full verified data
    if (!authReq.user) {
      authReq.user = {
        id: sub,
        sub,
        email: undefined,
        phone: undefined,
        app_metadata: {},
        user_metadata: {},
        role: undefined,
      } as SupabaseJwtPayload;
    }

    // Look up the user's profile to get church_id, branch_id, and role
    if (!authReq.profile) {
      const profile = await this.prisma.profile.findUnique({
        where: { user_id: sub },
        select: { id: true, church_id: true, branch_id: true, role: true },
      });
      if (profile) {
        authReq.profile = {
          ...profile,
          branch_id: profile.branch_id ?? undefined,
        };
      }
    }

    const profile = authReq.profile;

    const context = {
      userId: authReq.user.id,
      churchId: profile?.church_id || '',
      branchId: profile?.branch_id,
      role: profile?.role || 'member',
    };

    this.requestContext.run(context, () => {
      next();
    });
  }
}
