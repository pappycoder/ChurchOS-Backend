/**
 * @file request-context.middleware.ts
 * @description Middleware that populates RequestContext from the authenticated request.
 *
 * Runs on every request after JwtAuthGuard has verified the token and
 * attached user/profile to the request. Extracts userId, churchId, branchId,
 * and role, then wraps the downstream handler in RequestContextService.run()
 * so all services in the call stack have access to the tenant context.
 *
 * @module common/middleware/request-context
 * @since 1.0.0
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from '../services/request-context.service';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    const profile = authReq.profile;

    if (!user?.id) {
      next();
      return;
    }

    const context = {
      userId: user.id,
      churchId: profile?.church_id || '',
      branchId: profile?.branch_id,
      role: profile?.role || 'member',
    };

    this.requestContext.run(context, () => {
      next();
    });
  }
}
