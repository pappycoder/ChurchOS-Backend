import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
import { assertPlanFeature } from './entitlements';
import { PlanFeature } from './plans';

/** Permissions run first. Historical reads, reductions and settlement callbacks remain available. */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.profile || ['HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) return true;
    const path = req.path.replace(/^\/api\/v1/, '');
    if (req.method === 'GET' && !/^\/(analytics|reports)(?:\/|$)/.test(path)) return true;
    if (/\/(?:archive|cancel|pause|verify|webhook)(?:\/|$)/.test(path)) return true;
    const rules: [RegExp, PlanFeature][] = [
      [/^\/analytics(?:\/|$)/, 'analytics'],
      [/^\/(?:assets|asset-categories)(?:\/|$)/, 'assets'],
      [/^\/(?:pastoral|appointments)(?:\/|$)/, 'pastoral'],
      [/^\/forms(?:\/|$)/, 'forms'],
      [/^\/admin\/(?:departments|cell-groups)(?:\/|$)/, 'groups'],
      [/^\/reports(?:\/|$)/, 'reports'],
      [/^\/events\/.*(?:ticket|checkin)/, 'tickets'],
      [/^\/events(?:\/|$)/, 'events'],
      [/^\/giving(?:\/|$)/, 'giving'],
    ];
    const feature = rules.find(([pattern]) => pattern.test(path))?.[1];
    if (feature) await assertPlanFeature(this.prisma, req.profile.church_id, feature);
    return true;
  }
}
@Injectable()
export class BillingAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roles = req.profile?.roles ?? [req.profile?.role];
    if (!roles.some((role) => role === 'church_admin' || role === 'super_admin'))
      throw new ForbiddenException('Only church administrators manage subscriptions.');
    return true;
  }
}
