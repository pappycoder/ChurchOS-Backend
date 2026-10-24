// Unit scope tests replace only the joined reader; real SQL is tested separately.
jest.mock('../../../src/auth/services/hydrated-profile', () => ({
  hydratedProfile: (
    prisma: { profile: { findUnique: (query: unknown) => Promise<unknown> } },
    userId: string,
  ) => prisma.profile.findUnique({ where: { user_id: userId } }),
}));
import { validate } from 'class-validator';
import { accessRoles } from '../../../src/auth/role-policy';
import { PermissionsService } from '../../../src/auth/services/permissions.service';
import { InviteUserDto } from '../../../src/profile/dto/invite-user.dto';
import { UpdateRoleDto } from '../../../src/profile/dto/update-role.dto';
import { UpdateRolesDto } from '../../../src/profile/dto/update-roles.dto';
import { InviteStaffDto } from '../../../src/church/dto/invite-staff.dto';
import { UpdateStaffRoleDto } from '../../../src/church/dto/update-staff-role.dto';
import { RequestContextMiddleware } from '../../../src/common/middleware/request-context.middleware';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { ForbiddenException } from '@nestjs/common';
import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSION_MATRIX,
} from '../../../prisma/seeds/shared/permissions.seed';

describe('Retired member login role', () => {
  it('removes the role from the seeded catalog while retaining staff roles', () => {
    expect(DEFAULT_ROLES.map((r) => r.name)).not.toContain('member');
    expect(DEFAULT_PERMISSION_MATRIX.member).toBeUndefined();
    expect(accessRoles(['member', 'cell_leader'])).toEqual(['cell_leader']);
    expect(accessRoles(['member'])).toEqual([]);
    expect(accessRoles(undefined)).toEqual([]);
  });

  it.each([InviteUserDto, UpdateRoleDto, InviteStaffDto, UpdateStaffRoleDto])(
    'rejects retired-role assignments in %p',
    async (Dto) => {
      const errors = await validate(Object.assign(new Dto(), { role: 'member' }));
      expect(errors.find((e) => e.property === 'role')?.constraints?.isIn).toBeDefined();
    },
  );

  it('rejects the retired role in multi-role assignments', async () => {
    const errors = await validate(
      Object.assign(new UpdateRolesDto(), { roles: ['cell_leader', 'member'] }),
    );
    expect(errors.find((e) => e.property === 'roles')?.constraints?.isIn).toBeDefined();
  });

  it('ignores retired grants even when Redis contains an old resolution and reserves the custom name', async () => {
    const redis = { get: jest.fn().mockResolvedValue(['members:read']) };
    const service = new PermissionsService({} as never, redis as never, {} as never);
    expect(await service.getPermissionsForRole('church', 'member')).toEqual([]);
    expect(await service.getUserPermissions('church', ['member'])).toEqual([]);
    expect(redis.get).not.toHaveBeenCalled();
    await expect(service.createRole('church', { label: 'Member' })).rejects.toThrow('reserved');
    await expect(service.getRolePermissions('church', 'member')).rejects.toThrow('not found');
    await expect(service.setPermissionsForRole('church', 'member', [])).rejects.toThrow(
      'not found',
    );
  });

  it.each([{ role: ['member'] }, { role: [] }])(
    'denies authenticated profiles with no remaining staff role: %p',
    async ({ role }) => {
      const permissions = { getUserPermissions: jest.fn() };
      const middleware = new RequestContextMiddleware(
        new RequestContextService(),
        {
          profile: {
            findUnique: async () => ({ id: 'p', church_id: 'c', role, status: 'active' }),
          },
        } as never,
        permissions as never,
        { verifyToken: async () => ({ payload: { sub: 'u' } }) } as never,
      );
      const next = jest.fn();
      await middleware.use(
        { headers: { authorization: 'Bearer token' } } as never,
        {} as never,
        next,
      );
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenException);
      expect(permissions.getUserPermissions).not.toHaveBeenCalled();
    },
  );
});
