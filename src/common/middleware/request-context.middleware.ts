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

import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
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
      // Dynamic import: load jose at runtime to avoid CommonJS/ESM conflicts
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { decodeJwt } = await (eval('import("jose")') as Promise<
        typeof import('jose')
      >);
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

    // Look up the user's profile to get church_id, branch_id, and roles.
    // role is a text array ordered by rank desc; expose the primary role
    // as `role` and the full set as `roles` for downstream consumers.
    if (!authReq.profile) {
      const profile = await this.prisma.profile.findUnique({
        where: { user_id: sub },
        select: {
          id: true,
          church_id: true,
          branch_id: true,
          member_id: true,
          role: true,
          status: true,
          is_admin_hq: true,
          church: { select: { archived_at: true } },
        },
      });
      if (profile) {
        authReq.profile = {
          id: profile.id,
          church_id: profile.church_id,
          branch_id: profile.branch_id ?? undefined,
          member_id: profile.member_id ?? undefined,
          role: profile.role[0] ?? 'member',
          roles: profile.role,
          status: profile.status,
          is_admin_hq: profile.is_admin_hq,
          church_archived_at: profile.church?.archived_at?.toISOString(),
        };
      }
    }

    const profile = authReq.profile;

    // Reject requests from deactivated accounts before they reach any handler
    if (profile && profile.status === 'inactive') {
      next(new ForbiddenException('Account deactivated. Contact your church administrator.'));
      return;
    }

    // Reject requests from accounts whose church has been archived, except the
    // restore route — an admin session must be able to restore their own church.
    const isChurchRestore = req.method === 'POST' && req.path.endsWith('/church/restore');
    if (profile && profile.church_archived_at && !isChurchRestore) {
      next(new ForbiddenException('This church has been archived.'));
      return;
    }

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
