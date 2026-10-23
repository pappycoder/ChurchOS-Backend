import { ForbiddenException } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { churchEntitlements } from './entitlements';

export const BUILT_IN_STAFF_ROLES = [
  'church_admin',
  'senior_pastor',
  'branch_pastor',
  'secretary',
  'treasurer',
  'usher',
  'department_head',
  'cell_leader',
] as const;
export const ESSENTIALS_STAFF_ROLES = ['senior_pastor', 'branch_pastor', 'secretary'] as const;
export function roleAvailableOnPlan(plan: SubscriptionPlan, role: string): boolean {
  if (role === 'super_admin') return true; // Existing platform access; assignment guards remain authoritative.
  if (plan === 'essentials')
    return role === 'church_admin' || (ESSENTIALS_STAFF_ROLES as readonly string[]).includes(role);
  if (plan === 'community') return (BUILT_IN_STAFF_ROLES as readonly string[]).includes(role);
  return role !== 'member';
}
export async function assertAssignableRoles(
  prisma: PrismaService,
  churchId: string,
  requested: readonly string[],
  current: readonly string[] = [],
): Promise<void> {
  const { plan, active } = await churchEntitlements(prisma, churchId);
  const invalid =
    requested.some((role) => !roleAvailableOnPlan(plan, role)) ||
    (plan === 'essentials' &&
      (requested.length !== 1 ||
        (requested.includes('church_admin') && !current.includes('church_admin'))));
  if (!active || invalid) {
    const custom = requested.some(
      (role) =>
        !(BUILT_IN_STAFF_ROLES as readonly string[]).includes(role) && role !== 'super_admin',
    );
    throw new ForbiddenException({
      code: 'PLAN_FEATURE_REQUIRED',
      message:
        plan === 'essentials'
          ? 'Essentials includes one Church Admin and one additional staff user: Senior Pastor, Branch Pastor or Secretary.'
          : 'Custom staff roles require Network or Enterprise.',
      details: { feature: custom ? 'custom_roles' : 'staff_roles' },
    });
  }
}
