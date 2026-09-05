/**
 * @file roles.guard.ts
 * @description Guard that enforces role-based access control.
 *
 * Checks if the authenticated user has at least one of the roles specified
 * by the @RequireRoles() decorator. The user's role is fetched from their
 * Profile record.
 *
 * Also populates `request.user.profile.permissions` for downstream use
 * by PermissionsGuard and service-level permission checks.
 *
 * @module auth/guards/roles.guard
 * @since 1.0.0
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../services/permissions.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../../common/decorators/current-user.decorator';

/**
 * Guard that checks user roles against the @RequireRoles() decorator.
 *
 * Must be used after JwtAuthGuard so that `request.user` is populated.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @RequireRoles('church_admin')
 * @Put('church/settings')
 * updateSettings() { ... }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('No authenticated user');
    }

    // Fetch the user's profile to get their roles and church context.
    // role is a text array ordered by rank desc; role[0] is the primary role.
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: user.sub },
      select: { role: true, church_id: true },
    });

    if (!profile) {
      throw new ForbiddenException('User profile not found');
    }

    const roleNames = profile.role ?? [];

    // Populate permissions on the request for downstream use
    // This is cached in Redis by PermissionsService (15-min TTL)
    const userPermissions = await this.permissionsService.getUserPermissions(
      profile.church_id,
      roleNames,
    );

    if (request.profile) {
      request.profile.permissions = userPermissions;
    }

    // If no roles are required, just populate permissions and allow
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Check if the user holds at least one of the required roles
    if (!requiredRoles.some((role) => roleNames.includes(role))) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your roles: ${roleNames.join(', ')}`,
      );
    }

    return true;
  }
}
