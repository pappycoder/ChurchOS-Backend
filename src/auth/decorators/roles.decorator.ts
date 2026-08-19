/**
 * @file roles.decorator.ts
 * @description Decorator for restricting route access to specific roles.
 *
 * Works with RolesGuard to enforce role-based access control on controllers.
 * Roles are stored in the Profile model and checked against the user's
 * Supabase Auth token.
 *
 * @module auth/decorators/roles.decorator
 * @since 1.0.0
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users with one of the specified roles.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @RequireRoles('church_admin', 'pastor')
 * @Delete('members/:id')
 * remove(@Param('id') id: string) {
 *   return this.membersService.remove(id);
 * }
 * ```
 */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
