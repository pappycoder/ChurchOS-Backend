import { assertAssignableRoles, roleAvailableOnPlan } from '../../../src/billing/role-policy';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';
import { PermissionsService } from '../../../src/auth/services/permissions.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { featureForPermission } from '../../../src/billing/feature-policy';
import { planFeatures } from '../../../src/billing/plans';

describe('Subscription staff roles', () => {
  const prisma = createPrismaMock();
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'essentials',
      paid_until: new Date('2099-01-01'),
    });
  });
  it.each(['senior_pastor', 'branch_pastor', 'secretary'])(
    'Essentials permits the additional staff role %s',
    async (role) => {
      await expect(
        assertAssignableRoles(prisma as never, 'church', [role]),
      ).resolves.toBeUndefined();
    },
  );
  it.each(['church_admin', 'treasurer', 'usher', 'cell_leader', 'department_head', 'media_team'])(
    'Essentials cannot invite %s',
    async (role) => {
      await expect(assertAssignableRoles(prisma as never, 'church', [role])).rejects.toThrow(
        'Essentials',
      );
    },
  );
  it('preserves the existing Essentials administrator but rejects multiple roles', async () => {
    await expect(
      assertAssignableRoles(prisma as never, 'church', ['church_admin'], ['church_admin']),
    ).resolves.toBeUndefined();
    await expect(
      assertAssignableRoles(prisma as never, 'church', ['secretary', 'branch_pastor']),
    ).rejects.toThrow();
  });
  it('Community supports built-in roles and blocks custom roles', async () => {
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'community',
      paid_until: new Date('2099-01-01'),
    });
    await expect(
      assertAssignableRoles(prisma as never, 'church', ['usher', 'treasurer']),
    ).resolves.toBeUndefined();
    await expect(assertAssignableRoles(prisma as never, 'church', ['media_team'])).rejects.toThrow(
      'Custom staff roles',
    );
  });
  it.each(['network', 'enterprise'])('%s supports custom roles', async (plan) => {
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan,
      paid_until: new Date('2099-01-01'),
    });
    await expect(
      assertAssignableRoles(prisma as never, 'church', ['media_team']),
    ).resolves.toBeUndefined();
  });
  it('blocks changes on an inactive subscription', async () => {
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'network',
      paid_until: new Date('2020-01-01'),
    });
    await expect(
      assertAssignableRoles(prisma as never, 'church', ['media_team']),
    ).rejects.toThrow();
  });
  it('does not resolve cached custom-role grants after downgrade', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(['roles:create', 'members:read']),
      set: jest.fn(),
    };
    const service = new PermissionsService(
      prisma as unknown as PrismaService,
      redis as never,
      { log: jest.fn() } as never,
    );
    prisma.platformSubscription.findUnique.mockResolvedValue({
      plan: 'community',
      paid_until: new Date('2099-01-01'),
    });
    await expect(service.getUserPermissions('church', ['media_team'])).resolves.toEqual([]);
    expect(redis.get).not.toHaveBeenCalled();
    expect(roleAvailableOnPlan('essentials', 'treasurer')).toBe(false);
  });
  it('advertises custom role creation only on Network and Enterprise', () => {
    expect(featureForPermission('roles:create')).toBe('custom_roles');
    expect(planFeatures('essentials')).not.toContain('staff_roles');
    expect(planFeatures('community')).toContain('staff_roles');
    expect(planFeatures('community')).not.toContain('custom_roles');
    expect(planFeatures('network')).toContain('custom_roles');
  });
});
