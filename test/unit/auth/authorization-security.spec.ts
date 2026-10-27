import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../src/auth/guards/permissions.guard';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';

function context(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => context,
    getClass: () => Object,
  } as unknown as ExecutionContext;
}

describe('Authorization boundaries', () => {
  const requestContext = new RequestContextService();
  const viewer = {
    church_id: 'church-a',
    branch_id: 'branch-a',
    role: 'secretary',
    is_admin_hq: false,
  };

  it('rejects unauthenticated callers on permission-protected routes', async () => {
    const permissions = { getUserPermissions: jest.fn() };
    const guard = new PermissionsGuard(
      { getAllAndOverride: () => ['members:all:read'] } as unknown as Reflector,
      permissions as never,
      {} as never,
    );
    await expect(guard.canActivate(context({}))).rejects.toThrow(UnauthorizedException);
    expect(permissions.getUserPermissions).not.toHaveBeenCalled();
  });

  it('requires every declared permission and reuses hydrated grants', async () => {
    const permissions = { getUserPermissions: jest.fn() };
    const guard = new PermissionsGuard(
      {
        getAllAndOverride: () => ['profiles:update', 'church_settings:update'],
      } as unknown as Reflector,
      permissions as never,
      {} as never,
    );
    const request = {
      user: { sub: 'user' },
      profile: { ...viewer, permissions: ['profiles:update'] },
    };
    await expect(guard.canActivate(context(request))).rejects.toThrow(ForbiddenException);
    request.profile.permissions.push('church_settings:update');
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(permissions.getUserPermissions).not.toHaveBeenCalled();
  });

  it('never authorizes revoked tokens or revocation-store outages while session reads run concurrently', async () => {
    const redis = { get: jest.fn().mockResolvedValue(true) };
    const authenticator = { assertSession: jest.fn() };
    const guard = new JwtAuthGuard({} as never, redis as never, authenticator as never);
    const request = { headers: { authorization: 'Bearer token' }, verifiedJwt: { sub: 'user' } };
    await expect(guard.canActivate(context(request))).rejects.toThrow(UnauthorizedException);
    redis.get.mockRejectedValue(new Error('Redis offline'));
    await expect(guard.canActivate(context(request))).rejects.toThrow(ServiceUnavailableException);
    expect(authenticator.assertSession).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveProperty('user');
  });

  it('does not grant church-wide scope to a request without a profile', async () => {
    await requestContext.run({ userId: 'user', churchId: 'church-a', role: 'member' }, () => {
      expect(() => requestContext.branchWhere('church-a')).toThrow(ForbiddenException);
      expect(new BranchScopeService(requestContext).resolve().churchOnly).toBe(false);
    });
  });

  it('rejects cross-tenant access even for HQ viewers', async () => {
    await requestContext.run(
      {
        userId: 'user',
        churchId: 'church-a',
        role: 'secretary',
        viewer: { ...viewer, is_admin_hq: true },
      },
      () => {
        expect(() => requestContext.branchWhere('church-b')).toThrow(ForbiddenException);
      },
    );
  });

  it('pins writes to the assigned branch and rejects unassigned writers', async () => {
    await requestContext.run(
      { userId: 'user', churchId: 'church-a', role: 'secretary', viewer },
      () => {
        expect(requestContext.branchIdForWrite('church-a')).toBe('branch-a');
        expect(() => requestContext.branchIdForWrite('church-a', 'branch-b')).toThrow(
          ForbiddenException,
        );
      },
    );
    await requestContext.run(
      {
        userId: 'user',
        churchId: 'church-a',
        role: 'secretary',
        viewer: { ...viewer, branch_id: undefined },
      },
      () => {
        expect(() => requestContext.branchIdForWrite('church-a')).toThrow(ForbiddenException);
      },
    );
  });
});
