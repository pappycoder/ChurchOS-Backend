/**
 * @file permissions.guard.ts
 * @description Guard that enforces fine-grained permission-based access control.
 *
 * Checks if the authenticated user has ALL of the permissions specified
 * by the @RequirePermissions() decorator. Resolves permissions via
 * PermissionsService which checks church-specific overrides first,
 * then falls back to global defaults.
 *
 * Must be used after JwtAuthGuard so that `request.user` is populated.
 * Also populates `request.user.profile.permissions` for downstream use.
 *
 * @module auth/guards/permissions.guard
 * @since 1.0.0
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsService } from '../services/permissions.service';
import { AuthenticatedRequest } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard that checks user permissions against the @RequirePermissions() decorator.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
 * @RequirePermissions('members:delete')
 * @Delete('members/:id')
 * remove(@Param('id') id: string) { ... }
 * ```
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required — allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('No authenticated user');
    }

    // Fetch the user's profile to get role and church_id
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: user.sub },
      select: { role: true, church_id: true },
    });

    if (!profile) {
      throw new ForbiddenException('User profile not found');
    }

    // Get effective permissions for this user's role in their church
    const userPermissions = await this.permissionsService.getUserPermissions(
      profile.church_id,
      profile.role,
    );

    // Populate permissions on the request for downstream use
    if (request.profile) {
      request.profile.permissions = userPermissions;
    }

    // Check if user has ALL required permissions
    const missingPermissions = requiredPermissions.filter(
      (perm) => !userPermissions.includes(perm),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Access denied. Missing permissions: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
