import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_ROLES,
  generateAllPermissions,
} from '../../../prisma/seeds/shared/permissions.seed';
import { PermissionsService } from '../../../src/auth/services/permissions.service';
import { PermissionsGuard } from '../../../src/auth/guards/permissions.guard';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';

const contracts: Record<string, { allow: string[]; deny: string[] }> = {
  super_admin: {
    allow: ['church_settings:update', 'roles:update', 'branches:create', 'giving:records:delete'],
    deny: [],
  },
  church_admin: {
    allow: ['church_settings:update', 'roles:update', 'branches:create', 'members:all:delete'],
    deny: [],
  },
  senior_pastor: {
    allow: ['members:all:delete', 'giving:records:delete', 'appointments:create', 'roles:read'],
    deny: [
      'church_settings:update',
      'church_settings:read',
      'roles:update',
      'profiles:update',
      'branches:create',
    ],
  },
  branch_pastor: {
    allow: ['members:all:delete', 'giving:records:delete', 'appointments:create', 'roles:read'],
    deny: [
      'church_settings:update',
      'church_settings:read',
      'roles:update',
      'profiles:update',
      'branches:create',
    ],
  },
  secretary: {
    allow: [
      'members:new:create',
      'events:registrations:read',
      'forms:list:update',
      'reports:financial:read',
      'appointments:create',
    ],
    deny: [
      'attendance:checkin:create',
      'giving:records:read',
      'cell_groups:giving:read',
      'roles:update',
      'church_settings:update',
    ],
  },
  treasurer: {
    allow: ['giving:records:create', 'assets:list:delete', 'reports:financial:read'],
    deny: [
      'members:all:read',
      'attendance:services:create',
      'church_settings:read',
      'roles:update',
      'events:all:read',
    ],
  },
  usher: {
    allow: [
      'giving:records:create',
      'attendance:services:create',
      'attendance:records:delete',
      'reports:attendance:read',
      'cell_groups:details:read',
    ],
    deny: ['members:all:read', 'cell_groups:giving:create', 'profiles:update', 'roles:update'],
  },
  department_head: {
    allow: ['departments:own:update', 'departments:read', 'media:update', 'events:tickets:read'],
    deny: [
      'media:upload:create',
      'sermons:new:create',
      'departments:create',
      'roles:update',
      'giving:records:read',
    ],
  },
  cell_leader: {
    allow: [
      'cell_groups:giving:create',
      'cell_groups:details:read',
      'cell_groups:own:update',
      'events:tickets:read',
    ],
    deny: [
      'cell_groups:delete',
      'giving:records:create',
      'events:all:read',
      'events:checkin:create',
      'roles:update',
    ],
  },
  member: {
    allow: ['members:own:read', 'events:tickets:read', 'sermons:list:read', 'media:library:read'],
    deny: [
      'members:all:read',
      'profiles:update',
      'church_settings:update',
      'roles:update',
      'offline:read',
    ],
  },
};

function resolver() {
  const service = new PermissionsService(
    { permission: { findMany: async () => generateAllPermissions() } } as never,
    { get: async () => null, set: async () => undefined } as never,
    {} as never,
  );
  jest
    .spyOn(service, 'getPermissionsForRole')
    .mockImplementation(async (_church, role) => DEFAULT_PERMISSION_MATRIX[role] ?? []);
  return service;
}

function context(profile: unknown): ExecutionContext {
  return {
    getHandler: () => context,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'user' }, profile }) }),
  } as unknown as ExecutionContext;
}

const cases = DEFAULT_ROLES.flatMap(({ name }) => [false, true].map((hq) => ({ role: name, hq })));

describe('Analytics administrator-only defaults', () => {
  it.each(cases)(
    '$role (HQ=$hq) is checked at every analytics API permission',
    async ({ role, hq }) => {
      const service = resolver();
      for (const surface of [
        'dashboard',
        'giving',
        'attendance',
        'members',
        'events',
        'communication',
      ]) {
        const guard = new PermissionsGuard(
          { getAllAndOverride: () => [`analytics:${surface}:read`] } as unknown as Reflector,
          service,
          {} as never,
        );
        const request = context({ church_id: 'church', role, roles: [role], is_admin_hq: hq });
        if (['church_admin', 'super_admin'].includes(role))
          await expect(guard.canActivate(request)).resolves.toBe(true);
        else await expect(guard.canActivate(request)).rejects.toThrow(ForbiddenException);
      }
    },
  );

  it.each(DEFAULT_ROLES.map((role) => role.name))('keeps analytics exclusive for %s', (role) => {
    const grants =
      role === 'super_admin'
        ? generateAllPermissions().map((permission) => permission.name)
        : DEFAULT_PERMISSION_MATRIX[role];
    expect(grants.some((permission) => permission.startsWith('analytics:'))).toBe(
      ['church_admin', 'super_admin'].includes(role),
    );
  });
});

describe('All built-in roles × branch/HQ authorization', () => {
  it('has an explicit allow/deny contract for every seeded role', () => {
    expect(Object.keys(contracts).sort()).toEqual(DEFAULT_ROLES.map((r) => r.name).sort());
    const names = new Set(generateAllPermissions().map((p) => p.name));
    for (const permissions of Object.values(DEFAULT_PERMISSION_MATRIX))
      for (const permission of permissions) expect(names.has(permission)).toBe(true);
  });

  it.each(cases)(
    '$role (HQ=$hq) permits expected actions and rejects forbidden actions',
    async ({ role, hq }) => {
      const permissions = await resolver().getUserPermissions('church', [role]);
      const profile = {
        id: 'profile',
        church_id: 'church',
        branch_id: 'branch-a',
        role,
        roles: [role],
        is_admin_hq: hq,
        permissions,
      };
      for (const permission of contracts[role].allow) {
        const guard = new PermissionsGuard(
          { getAllAndOverride: () => [permission] } as unknown as Reflector,
          {} as never,
          {} as never,
        );
        await expect(guard.canActivate(context(profile))).resolves.toBe(true);
      }
      for (const permission of contracts[role].deny) {
        const guard = new PermissionsGuard(
          { getAllAndOverride: () => [permission] } as unknown as Reflector,
          {} as never,
          {} as never,
        );
        await expect(guard.canActivate(context(profile))).rejects.toThrow(ForbiddenException);
      }
    },
  );

  it.each(cases)(
    '$role (HQ=$hq) respects branch reads, writes and tenant boundaries',
    async ({ role, hq }) => {
      const permissions = await resolver().getUserPermissions('church', [role]);
      const requests = new RequestContextService();
      const scope = new BranchScopeService(requests);
      const viewer = {
        church_id: 'church',
        branch_id: 'branch-a',
        member_id: 'member-a',
        role,
        is_admin_hq: hq,
        permissions,
      };
      await requests.run({ userId: 'user', churchId: 'church', role, viewer }, () => {
        expect(scope.isVisible(viewer, 'branch-a')).toBe(true);
        expect(scope.isVisible(viewer, 'branch-b')).toBe(hq);
        expect(requests.branchWhere('church')).toEqual(hq ? {} : { branch_id: 'branch-a' });
        if (hq) expect(requests.branchIdForWrite('church', 'branch-b')).toBe('branch-b');
        else
          expect(() => requests.branchIdForWrite('church', 'branch-b')).toThrow(ForbiddenException);
        expect(() => requests.branchWhere('other-church')).toThrow(ForbiddenException);
        expect(scope.resolveCellGroupScope(viewer)).toEqual(
          hq
            ? { churchOnly: true }
            : role === 'cell_leader'
              ? { churchOnly: false, leaderId: 'member-a' }
              : { churchOnly: false, branchId: 'branch-a' },
        );
        expect(scope.resolveDepartmentScope(viewer)).toEqual(
          hq
            ? { churchOnly: true }
            : role === 'department_head'
              ? { churchOnly: false, headId: 'member-a' }
              : { churchOnly: false, branchId: 'branch-a' },
        );
      });
    },
  );

  it.each(DEFAULT_ROLES)(
    '$name fails closed without a branch when HQ is disabled',
    async ({ name: role }) => {
      const requests = new RequestContextService();
      const scope = new BranchScopeService(requests);
      const viewer = { church_id: 'church', role, is_admin_hq: false };
      await requests.run({ userId: 'user', churchId: 'church', role, viewer }, () => {
        expect(scope.isVisible(viewer, 'branch-a')).toBe(false);
        expect(scope.isVisible(viewer, null)).toBe(false);
        expect(requests.branchWhere('church').branch_id).toBeTruthy();
        expect(() => requests.branchIdForWrite('church')).toThrow(ForbiddenException);
      });
    },
  );

  it('unions multiple roles without turning HQ into an administrative grant', async () => {
    const service = resolver();
    const permissions = await service.getUserPermissions('church', [
      'treasurer',
      'cell_leader',
      'treasurer',
    ]);
    expect(permissions).toEqual(
      expect.arrayContaining(['giving:records:create', 'cell_groups:giving:create']),
    );
    for (const permission of [
      'church_settings:update',
      'roles:update',
      'branches:create',
      'data_scope:church:read',
    ])
      expect(permissions).not.toContain(permission);
    expect(permissions.length).toBe(new Set(permissions).size);
  });
});
