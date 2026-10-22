import { BillingAdminGuard, PlanFeatureGuard } from '../../../src/billing/plan-feature.guard';
import { churchEntitlements, assertPlanFeature } from '../../../src/billing/entitlements';
import { ExecutionContext } from '@nestjs/common';
const context = (request: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => context,
    getClass: () => PlanFeatureGuard,
  }) as unknown as ExecutionContext;
describe('Subscription privacy and feature access', () => {
  it.each(['secretary', 'senior_pastor', 'custom_admin', 'department_head'])(
    'denies billing screens to %s even with copied billing permissions',
    (role) => {
      expect(() =>
        new BillingAdminGuard().canActivate(
          context({
            profile: {
              roles: [role],
              permissions: ['billing:read', 'billing:update'],
              is_admin_hq: true,
            },
          }),
        ),
      ).toThrow('Only church administrators');
    },
  );
  it.each(['church_admin', 'super_admin'])('allows %s to manage billing', (role) => {
    expect(new BillingAdminGuard().canActivate(context({ profile: { roles: [role] } }))).toBe(true);
  });
  it('fails closed for missing Enterprise limits', async () => {
    const prisma = {
      platformSubscription: {
        findUnique: async () => ({
          plan: 'enterprise',
          paid_until: new Date(Date.now() + 86400000),
          enterprise_limits: null,
        }),
      },
    };
    expect((await churchEntitlements(prisma as never, 'church')).limits).toEqual({
      members: 0,
      staff: 0,
      locations: 0,
    });
  });
  it('blocks both feature reads and writes outside the plan', async () => {
    const prisma = {
      platformSubscription: {
        findUnique: async () => ({
          plan: 'essentials',
          paid_until: new Date(Date.now() + 86400000),
        }),
      },
    };
    const guard = new PlanFeatureGuard(prisma as never);
    await expect(
      guard.canActivate(
        context({ method: 'POST', path: '/api/v1/forms', profile: { church_id: 'church' } }),
      ),
    ).rejects.toThrow('not available');
    await expect(
      guard.canActivate(
        context({ method: 'GET', path: '/api/v1/forms', profile: { church_id: 'church' } }),
      ),
    ).rejects.toThrow('not available');
    await expect(assertPlanFeature(prisma as never, 'church', 'email')).rejects.toThrow(
      'not available',
    );
  });
});
