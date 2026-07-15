/**
 * @file roles.guard.ts
 * @description Guard that enforces role-based access control.
 *
 * Checks if the authenticated user has at least one of the roles specified
 * by the @RequireRoles() decorator. The user's role is fetched from their
 * Profile record.
 *
 * @module auth/guards/roles.guard
 * @since 1.0.0
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Request } from 'express';

/**
 * Request user shape after JWT validation.
 */
interface JwtUser {
  sub: string;
  email?: string;
}

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required — allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtUser | undefined;

    if (!user?.sub) {
      throw new ForbiddenException('No authenticated user');
    }

    // Fetch the user's profile to get their role
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: user.sub },
      select: { role: true },
    });

    if (!profile) {
      throw new ForbiddenException('User profile not found');
    }

    if (!requiredRoles.includes(profile.role)) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${profile.role}`,
      );
    }

    return true;
  }
}
