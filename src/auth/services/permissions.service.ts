/**
 * @file permissions.service.ts
 * @description Service for managing role-based permissions with church-specific overrides.
 *
 * Resolves effective permissions by starting with global defaults, then
 * merging church-specific overrides additively. Caches results in Redis
 * with 15-minute TTL.
 *
 * The `super_admin` role is always locked to ALL permissions.
 *
 * @module auth/services/permissions.service
 * @since 1.0.0
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RolePermission } from '@prisma/client';

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const CACHE_PREFIX = 'perms:';

/** Represents a permission with its resource and action. */
export interface PermissionDto {
  id: string;
  name: string;
  resource: string;
  action: string;
}

/** Represents a role with its effective permissions for a church. */
export interface RoleWithPermissions {
  roleName: string;
  description: string | null;
  permissions: PermissionDto[];
  isCustomized: boolean;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Permission Resolution ────────────────────────────────

  /**
   * Gets effective permissions for a role in a church.
   * Starts with global defaults, then adds church-specific overrides.
   * super_admin always returns ALL permissions.
   *
   * @param churchId - Church ID
   * @param roleName - Role name (matches Profile.role string)
   * @returns Array of permission name strings (e.g., ["members:read", "members:update"])
   */
  async getPermissionsForRole(churchId: string, roleName: string): Promise<string[]> {
    if (roleName === 'super_admin') {
      return this.getAllPermissionNames();
    }

    const cacheKey = `${CACHE_PREFIX}${churchId}:${roleName}`;
    const cached = await this.redis.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const permissions = await this.resolvePermissions(churchId, roleName);
    await this.redis.set(cacheKey, permissions, CACHE_TTL_SECONDS);
    return permissions;
  }

  /**
   * Gets all effective permissions for a user based on their profile.
   * Accepts one or more role names and returns the union of their
   * permissions, so users with multiple roles accumulate access.
   *
   * @param churchId - Church ID
   * @param roleNames - Role name(s) from the user's profile
   * @returns Array of permission name strings
   */
  async getUserPermissions(churchId: string, roleNames: string | string[]): Promise<string[]> {
    const roles = Array.isArray(roleNames) ? roleNames : [roleNames];
    if (roles.length === 0) {
      return [];
    }

    const resolved = await Promise.all(
      roles.map((roleName) => this.getPermissionsForRole(churchId, roleName)),
    );

    const permSet = new Set<string>();
    for (const perms of resolved) {
      for (const p of perms) {
        permSet.add(p);
      }
    }
    return Array.from(permSet);
  }

  /**
   * Checks if a role has a specific permission in a church.
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   * @param permission - Permission name (e.g., "members:delete")
   * @returns true if the role has the permission
   */
  async hasPermission(churchId: string, roleName: string, permission: string): Promise<boolean> {
    const permissions = await this.getPermissionsForRole(churchId, roleName);
    return permissions.includes(permission);
  }

  // ─── Church Admin Management ──────────────────────────────

  /**
   * Gets all roles with their effective permissions for a church.
   * Used by the church admin UI to display and manage role permissions.
   *
   * @param churchId - Church ID
   * @returns Array of roles with their permissions and customization status
   */
  async getRolesSummary(churchId: string): Promise<RoleWithPermissions[]> {
    const [roles, permissions, churchOverrides] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: { name: 'asc' },
        select: { name: true, description: true },
      }),
      this.prisma.permission.findMany({
        orderBy: [{ resource: 'asc' }, { action: 'asc' }],
        select: { id: true, name: true, resource: true, action: true },
      }),
      this.prisma.churchRolePermission.findMany({
        where: { church_id: churchId },
        select: { role_name: true, permission_id: true },
      }),
    ]);

    // Build a set of customized roles
    const customizedRoles = new Set(churchOverrides.map((o: { role_name: string }) => o.role_name));

    // Build church override maps per role
    const overrideMap = new Map<string, Set<string>>();
    for (const override of churchOverrides) {
      const roleName = override.role_name;
      if (!overrideMap.has(roleName)) {
        overrideMap.set(roleName, new Set());
      }
      overrideMap.get(roleName)!.add(override.permission_id);
    }

    // Build global default permission maps per role
    const rolePermissions = await this.prisma.rolePermission.findMany({
      include: { role: { select: { name: true } }, permission: { select: { id: true } } },
    });
    const defaultMap = new Map<string, Set<string>>();
    for (const rp of rolePermissions) {
      const roleName = rp.role.name;
      if (!defaultMap.has(roleName)) {
        defaultMap.set(roleName, new Set());
      }
      defaultMap.get(roleName)!.add(rp.permission.id);
    }

    return roles.map((role: { name: string; description: string | null }) => {
      const isCustomized = customizedRoles.has(role.name);

      // Merge: start with defaults, add church overrides (additive)
      const permissionIds = new Set<string>(defaultMap.get(role.name) || new Set<string>());
      const roleOverrides = overrideMap.get(role.name);
      if (roleOverrides) {
        for (const id of roleOverrides) {
          permissionIds.add(id);
        }
      }

      const rolePerms = permissions.filter((p: PermissionDto) => permissionIds.has(p.id));

      return {
        roleName: role.name,
        description: role.description,
        permissions: rolePerms,
        isCustomized,
      };
    });
  }

  /**
   * Gets permissions for a specific role in a church.
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   * @returns Role with permissions and customization status
   */
  async getRolePermissions(churchId: string, roleName: string): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      select: { name: true, description: true },
    });

    if (!role) {
      throw new Error(`Role "${roleName}" not found`);
    }

    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, name: true, resource: true, action: true },
    });

    const [defaultPerms, overrideIds] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { name: roleName } },
        select: { permission_id: true },
      }),
      this.prisma.churchRolePermission.findMany({
        where: { church_id: churchId, role_name: roleName },
        select: { permission_id: true },
      }),
    ]);

    const isCustomized = overrideIds.length > 0;

    // Merge: start with defaults, add church overrides (additive)
    const effectiveIds = new Set<string>(
      defaultPerms.map((p: { permission_id: string }) => p.permission_id),
    );
    for (const o of overrideIds) {
      effectiveIds.add(o.permission_id);
    }

    const rolePerms = permissions.filter((p: PermissionDto) => effectiveIds.has(p.id));

    return {
      roleName: role.name,
      description: role.description,
      permissions: rolePerms,
      isCustomized,
    };
  }

  /**
   * Sets permissions for a role in a church (church_admin only).
   * Replaces all existing overrides for that role.
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   * @param permissionIds - Array of permission IDs to assign
   */
  async setPermissionsForRole(
    churchId: string,
    roleName: string,
    permissionIds: string[],
  ): Promise<void> {
    if (roleName === 'super_admin') {
      throw new Error('Cannot modify super_admin permissions (locked to ALL)');
    }

    // Prevent removing critical permissions from church_admin
    if (roleName === 'church_admin') {
      const allPermissions = await this.getAllPermissions();
      const REQUIRED_ADMIN_PERMISSIONS = [
        'members:create',
        'members:read',
        'members:update',
        'members:delete',
        'profiles:create',
        'profiles:read',
        'profiles:update',
        'profiles:delete',
        'church:read',
        'church:update',
      ];
      const providedNames = allPermissions
        .filter((p) => permissionIds.includes(p.id))
        .map((p) => p.name);
      const missing = REQUIRED_ADMIN_PERMISSIONS.filter((p) => !providedNames.includes(p));
      if (missing.length > 0) {
        throw new BadRequestException(
          `church_admin must always have these permissions: ${missing.join(', ')}`,
        );
      }
    }

    // Verify role exists
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new Error(`Role "${roleName}" not found`);
    }

    // Delete existing overrides and create new ones
    await this.prisma.$transaction([
      this.prisma.churchRolePermission.deleteMany({
        where: { church_id: churchId, role_name: roleName },
      }),
      ...permissionIds.map((permissionId: string) =>
        this.prisma.churchRolePermission.create({
          data: {
            church_id: churchId,
            role_name: roleName,
            permission_id: permissionId,
          },
        }),
      ),
    ]);

    await this.invalidateCache(churchId, roleName);
    this.logger.log(
      `Permissions updated for ${roleName} in church ${churchId}: ${permissionIds.length} permissions`,
    );
  }

  /**
   * Resets a role to global defaults (deletes all church overrides).
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   */
  async resetRoleToDefaults(churchId: string, roleName: string): Promise<void> {
    if (roleName === 'super_admin') {
      throw new Error('Cannot reset super_admin (always uses ALL permissions)');
    }

    await this.prisma.churchRolePermission.deleteMany({
      where: { church_id: churchId, role_name: roleName },
    });

    await this.invalidateCache(churchId, roleName);
    this.logger.log(`Role ${roleName} reset to defaults in church ${churchId}`);
  }

  /**
   * Lists all available permissions (resource:action pairs).
   *
   * @returns Array of all permissions
   */
  async getAllPermissions(): Promise<PermissionDto[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, name: true, resource: true, action: true },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────

  /**
   * Resolves effective permissions for a role in a church.
   *
   * Always starts with global defaults from role_permissions, then merges
   * church-specific overrides additively. This prevents a partial church
   * override from accidentally stripping default permissions.
   */
  private async resolvePermissions(churchId: string, roleName: string): Promise<string[]> {
    const [defaults, overrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { name: roleName } },
        include: { permission: { select: { name: true } } },
      }),
      this.prisma.churchRolePermission.findMany({
        where: { church_id: churchId, role_name: roleName },
        include: { permission: { select: { name: true } } },
      }),
    ]);

    // Start with global defaults, then add any church-specific extras
    const permSet = new Set<string>(
      defaults.map((d: RolePermission & { permission: { name: string } }) => d.permission.name),
    );
    for (const o of overrides) {
      permSet.add(o.permission.name);
    }

    return Array.from(permSet);
  }

  /**
   * Gets all permission names (used for super_admin).
   */
  private async getAllPermissionNames(): Promise<string[]> {
    const cacheKey = `${CACHE_PREFIX}all`;
    const cached = await this.redis.get<string[]>(cacheKey);
    if (cached) return cached;

    const permissions = await this.prisma.permission.findMany({
      select: { name: true },
    });
    const names = permissions.map((p: { name: string }) => p.name);
    await this.redis.set(cacheKey, names, CACHE_TTL_SECONDS);
    return names;
  }

  /**
   * Invalidates cached permissions for a role in a church.
   */
  private async invalidateCache(churchId: string, roleName: string): Promise<void> {
    await this.redis.del(`${CACHE_PREFIX}${churchId}:${roleName}`);
  }
}
