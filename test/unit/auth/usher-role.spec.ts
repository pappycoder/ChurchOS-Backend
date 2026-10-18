import { ValidationPipe } from '@nestjs/common';
import {
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_ROLES,
} from '../../../prisma/seeds/shared/permissions.seed';
import { UpdateRoleDto } from '../../../src/profile/dto/update-role.dto';
import { UpdateRolesDto } from '../../../src/profile/dto/update-roles.dto';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';

describe('Usher role', () => {
  it('keeps recurring management and service selection available to treasurers', () => {
    expect(DEFAULT_PERMISSION_MATRIX.treasurer).toEqual(
      expect.arrayContaining([
        'giving:recurring:create',
        'giving:recurring:read',
        'giving:recurring:update',
        'attendance:services:read',
      ]),
    );
    expect(DEFAULT_PERMISSION_MATRIX.treasurer).not.toContain('attendance:services:create');
  });
  it('inherits every treasurer permission and adds attendance management and reports', () => {
    expect(DEFAULT_ROLES.some((role) => role.name === 'usher')).toBe(true);
    expect(DEFAULT_PERMISSION_MATRIX.usher).toEqual(
      expect.arrayContaining(DEFAULT_PERMISSION_MATRIX.treasurer),
    );
    expect(DEFAULT_PERMISSION_MATRIX.usher).toEqual(
      expect.arrayContaining([
        'attendance:services:create',
        'attendance:services:read',
        'attendance:services:update',
        'attendance:services:delete',
        'attendance:checkin:create',
        'attendance:records:read',
        'attendance:records:update',
        'events:create',
        'events:read',
        'events:update',
        'events:delete',
        'events:tickets:create',
        'events:tickets:read',
        'events:tickets:update',
        'events:tickets:delete',
        'events:ticket-records:read',
        'events:registrations:update',
        'events:view',
        'events:list:read',
        'events:all:read',
        'events:checkin:create',
        'events:checkin:read',
        'events:checkin:update',
        'events:registrations:read',
        'visitors:new:create',
        'visitors:list:read',
        'attendance:records:delete',
        'attendance:dashboard:read',
        'attendance:reports:read',
        'reports:attendance:read',
        'analytics:attendance:read',
      ]),
    );
    expect(DEFAULT_PERMISSION_MATRIX.usher).not.toContain('visitors:list:delete');
    expect(DEFAULT_PERMISSION_MATRIX.usher).not.toContain('church_settings:update');
    expect(DEFAULT_PERMISSION_MATRIX.usher).not.toContain('branches:create');
    expect(DEFAULT_PERMISSION_MATRIX.usher).not.toContain('members:all:read');
  });

  it('accepts usher in single and multiple role assignment requests', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(
      await pipe.transform({ role: 'usher' }, { type: 'body', metatype: UpdateRoleDto }),
    ).toMatchObject({ role: 'usher' });
    expect(
      await pipe.transform({ roles: ['usher'] }, { type: 'body', metatype: UpdateRolesDto }),
    ).toMatchObject({ roles: ['usher'] });
  });

  it('restricts branch ushers and allows overall scope only with admin HQ', () => {
    const scope = new BranchScopeService(new RequestContextService());
    const viewer = {
      church_id: 'church',
      role: 'usher',
      branch_id: 'lekki',
      permissions: DEFAULT_PERMISSION_MATRIX.usher,
    };
    expect(scope.resolve(viewer)).toEqual({ churchOnly: false, branchId: 'lekki' });
    expect(scope.isVisible(viewer, 'other-branch')).toBe(false);
    expect(scope.resolve({ ...viewer, is_admin_hq: true })).toEqual({ churchOnly: true });
    expect(scope.isVisible({ ...viewer, is_admin_hq: true }, 'other-branch')).toBe(true);
  });
});
