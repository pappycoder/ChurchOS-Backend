/**
 * @file permissions.decorator.ts
 * @description Decorator for restricting route access to users with specific permissions.
 *
 * Works with PermissionsGuard to enforce fine-grained permission-based access control.
 * Permissions are resolved from the user's role via the PermissionsService, checking
 * church-specific overrides before falling back to global defaults.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
 * @RequirePermissions('members:delete')
 * @Delete('members/:id')
 * remove(@Param('id') id: string) {
 *   return this.membersService.remove(id);
 * }
 * ```
 *
 * @module auth/decorators/permissions.decorator
 * @since 1.0.0
 */

import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restricts a route to users with ALL of the specified permissions.
 *
 * The user must have every listed permission to access the endpoint.
 * Permissions are checked against the effective permission set for the
 * user's role in their church (considering church-specific overrides).
 *
 * @param permissions - One or more permission names (e.g., "members:delete", "giving:read")
 * @returns Decorator function
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
