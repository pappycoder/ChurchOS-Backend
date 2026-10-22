import {
  FEATURE_MINIMUM_PLAN,
  featureForPermission as clientPermissionFeature,
} from '../../../src/assistant/routes.generated';
import { generateAllPermissions } from '../../../prisma/seeds/shared/permissions.seed';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanFeatureGuard } from '../../../src/billing/plan-feature.guard';
import {
  FEATURE_LEVELS,
  PLAN_RANK,
  planFeatures,
  SubscriptionPlan,
} from '../../../src/billing/plans';
import { featureForPermission, filterPlanPermissions } from '../../../src/billing/feature-policy';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';

function requestContext(request: Record<string, unknown>, permissions: string[] = []) {
  const handler = () => {};
  Reflect.defineMetadata(PERMISSIONS_KEY, permissions, handler);
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => PlanFeatureGuard,
  } as unknown as ExecutionContext;
}
const routes = [
  ['/giving/categories', 'giving'],
  ['/giving/dashboard', 'giving'],
  ['/giving/cell-groups/id', 'groups'],
  ['/members/id/giving', 'giving'],
  ['/events', 'events'],
  ['/events/management/tickets', 'tickets'],
  ['/events/id/tiers', 'tickets'],
  ['/events/id/check-in', 'tickets'],
  ['/events/id/attendance', 'tickets'],
  ['/admin/departments', 'groups'],
  ['/admin/cell-groups', 'groups'],
  ['/forms', 'forms'],
  ['/reports/financial', 'reports'],
  ['/assets/categories', 'assets'],
  ['/pastoral/notes', 'pastoral'],
  ['/admin/dashboard/engagement', 'pastoral'],
  ['/appointments', 'pastoral'],
  ['/analytics', 'analytics'],
  ['/church/integrations', 'giving'],
  ['/calls', 'calls'],
  ['/templates', 'email'],
  ['/broadcasts', 'email'],
  ['/messages', 'email'],
  ['/sermons', 'media'],
  ['/media/library', 'media'],
  ['/webhooks', 'webhooks'],
] as const;

describe.each(Object.keys(PLAN_RANK) as SubscriptionPlan[])('%s plan boundaries', (plan) => {
  const prisma = {
    platformSubscription: {
      findUnique: jest.fn(async () => ({ plan, paid_until: new Date(Date.now() + 86400000) })),
    },
  };
  const guard = new PlanFeatureGuard(prisma as never, new Reflector());
  it.each(routes)('%s requires %s on every read/write method', async (path, feature) => {
    for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      const request = {
        method,
        path: '/api/v1' + path,
        profile: { church_id: 'church', role: 'super_admin', is_admin_hq: true },
      };
      const result = guard.canActivate(requestContext(request));
      if (FEATURE_LEVELS[feature] <= PLAN_RANK[plan]) await expect(result).resolves.toBe(true);
      else await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});

describe('Composite routes, missing entitlements and narrow payment exceptions', () => {
  const make = (
    plan: SubscriptionPlan = 'essentials',
    paid_until: Date | null = new Date(Date.now() + 86400000),
  ) =>
    new PlanFeatureGuard({
      platformSubscription: { findUnique: async () => ({ plan, paid_until }) },
    } as never);
  it.each([
    ['/attendance/summary', 'attendance:dashboard:read'],
    ['/attendance/trends', 'attendance:reports:read'],
    ['/attendance/attendance', 'attendance:records:read'],
    ['/services', 'attendance:services:read'],
  ])('keeps core attendance %s available on Essentials', async (path, permission) => {
    await expect(
      make().canActivate(
        requestContext(
          {
            method: 'GET',
            path,
            profile: { church_id: 'church', permissions: [permission] },
          },
          [permission],
        ),
      ),
    ).resolves.toBe(true);
  });

  it('strips all premium read/view/delete grants before sync and offline handlers run', async () => {
    for (const path of ['/sync/bootstrap', '/sync/pull', '/offline/snapshot']) {
      const request = {
        method: 'GET',
        path,
        profile: {
          church_id: 'church',
          permissions: [
            'members:all:read',
            'giving:records:read',
            'giving:view',
            'giving:categories:delete',
            'forms:list:read',
            'events:checkin:read',
          ],
        },
      };
      await expect(make().canActivate(requestContext(request))).resolves.toBe(true);
      expect(request.profile.permissions).toEqual([
        'members:all:read',
        'giving:records:read',
        'giving:view',
        'giving:categories:delete',
      ]);
    }
  });
  it('uses permission metadata for premium data in another controller', async () => {
    await expect(
      make().canActivate(
        requestContext(
          { method: 'GET', path: '/some-composite-route', profile: { church_id: 'church' } },
          ['pastoral:engagement:read'],
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks event attendance via the generic attendance endpoint on Community', async () => {
    await expect(
      make('community').canActivate(
        requestContext({
          method: 'POST',
          path: '/attendance/attendance',
          body: { eventId: 'event' },
          profile: { church_id: 'church' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('requires Network for paid event creation through the basic event API', async () => {
    await expect(
      make('community').canActivate(
        requestContext({
          method: 'POST',
          path: '/events',
          body: { isFree: false, price: 100 },
          profile: { church_id: 'church' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      make('network').canActivate(
        requestContext({
          method: 'POST',
          path: '/events',
          body: { isFree: false, price: 100 },
          profile: { church_id: 'church' },
        }),
      ),
    ).resolves.toBe(true);
  });
  it('does not allow Community to configure SMS through the shared broadcast API', async () => {
    await expect(
      make('community').canActivate(
        requestContext({
          method: 'POST',
          path: '/broadcasts',
          body: { channel: 'sms' },
          profile: { church_id: 'church' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['/giving/verify/ref', '/giving/recurring/id/cancel', '/giving/recurring/id/pause'])(
    'preserves settlement/reduction at %s',
    async (path) => {
      await expect(
        make().canActivate(
          requestContext({
            method: path.includes('verify') ? 'GET' : 'PATCH',
            path,
            profile: { church_id: 'church' },
          }),
        ),
      ).resolves.toBe(true);
    },
  );
  it.each(['/forms/id/verify', '/forms/id/archive', '/events/id/cancel', '/events/id/restore'])(
    'does not bypass plan checks using action suffix %s',
    async (path) => {
      await expect(
        make().canActivate(
          requestContext({ method: 'POST', path, profile: { church_id: 'church' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('keeps core directory, services, account and billing accessible on Essentials', async () => {
    for (const path of [
      '/members',
      '/visitors',
      '/attendance/services',
      '/profiles/me',
      '/billing/status',
      '/church/roles',
    ])
      await expect(
        make().canActivate(
          requestContext({ method: 'GET', path, profile: { church_id: 'church' } }),
        ),
      ).resolves.toBe(true);
  });
  it('includes downloadable receipts on Essentials while respecting email and WhatsApp channel tiers', async () => {
    await expect(
      make().canActivate(
        requestContext({
          method: 'GET',
          path: '/giving/transactions/id/receipt',
          profile: { church_id: 'church' },
        }),
      ),
    ).resolves.toBe(true);
    for (const channel of ['email', 'whatsapp'])
      await expect(
        make().canActivate(
          requestContext({
            method: 'POST',
            path: '/giving/transactions/id/send-receipt',
            body: { channel },
            profile: { church_id: 'church' },
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not grant giving to an expired Essentials subscription', async () => {
    await expect(
      make('essentials', new Date(0)).canActivate(
        requestContext({
          method: 'GET',
          path: '/giving/categories',
          profile: { church_id: 'church' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not grant expired Network subscriptions premium access', async () => {
    await expect(
      make('network', new Date(0)).canActivate(
        requestContext({ method: 'GET', path: '/forms', profile: { church_id: 'church' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('maps ticket/check-in permissions separately and keeps giving on Essentials without ticket or group access', () => {
    expect(planFeatures('essentials')).toEqual(['giving']);
    expect(featureForPermission('cell_groups:giving:read')).toBe('groups');
    expect(featureForPermission('events:checkin:read')).toBe('tickets');
    expect(
      filterPlanPermissions(['events:list:read', 'events:tickets:read'], planFeatures('community')),
    ).toEqual(['events:list:read']);
  });
});

describe('Server/client catalog parity', () => {
  it('keeps every feature and permission mapped to the same minimum tier', () => {
    expect(Object.keys(FEATURE_MINIMUM_PLAN).sort()).toEqual(Object.keys(FEATURE_LEVELS).sort());
    for (const feature of Object.keys(FEATURE_LEVELS) as (keyof typeof FEATURE_LEVELS)[]) {
      expect(PLAN_RANK[FEATURE_MINIMUM_PLAN[feature]]).toBe(FEATURE_LEVELS[feature]);
    }
    for (const permission of generateAllPermissions())
      expect(featureForPermission(permission.name)).toBe(clientPermissionFeature(permission.name));
  });
});
