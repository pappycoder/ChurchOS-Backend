/**
 * @file permissions.service.ts
 * @description Service for managing role-based permissions with church-specific overrides.
 *
 * Roles come in two flavours:
 *  - Global templates (`Role.church_id = null`) shared by every church.
 *    Their effective permissions are the seeded defaults plus any additive
 *    church-level overrides stored in `ChurchRolePermission`.
 *  - Church-owned custom roles (`Role.church_id = <uuid>`), created per
 *    church. A church-owned role shadows the global template of the same
 *    name, and its permissions are stored directly in `RolePermission`
 *    as an absolute set.
 *
 * Results are cached in Redis with 15-minute TTL.
 *
 * The `super_admin` role is always locked to ALL permissions.
 *
 * @module auth/services/permissions.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditLoggingService } from '../../common/services/audit-logging.service';
import { RolePermission } from '@prisma/client';

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const CACHE_PREFIX = 'perms:';

/** Role names that churches cannot claim or modify. */
export const RESERVED_ROLE_NAMES = [
  'super_admin',
  'senior_pastor',
  'church_admin',
  'branch_pastor',
  'department_head',
  'secretary',
  'treasurer',
  'member',
] as const;

/** Custom role names are lowercase snake_case, 3–40 chars, starting with a letter. */
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;

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
  /** Human-friendly display name; templates fall back to the frontend dictionary. */
  label: string | null;
  description: string | null;
  permissions: PermissionDto[];
  /** Whether the role's permissions were customized by this church (templates only). */
  isCustomized: boolean;
  /** Whether the role is owned by this church rather than a global template. */
  isChurchOwned: boolean;
}

/** Input for creating a church-owned custom role. */
export interface CreateRoleInput {
  label: string;
  description?: string;
  permissionIds?: string[];
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLoggingService,
  ) {}

  // ─── Permission Resolution ────────────────────────────────

  /**
   * Gets effective permissions for a role in a church.
   * For global templates this is the defaults plus church-specific overrides.
   * For church-owned roles it is the absolute stored set.
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
   * Creates a church-owned custom role.
   *
   * The label is slugified into a snake_case role name (e.g. "Media Team"
   * becomes "media_team"), which must not collide with a reserved role or an
   * existing global/church role of the same name.
   *
   * @param churchId - Owning church ID
   * @param input - Label, optional description and initial permission IDs
   * @param actorUserId - Supabase user ID of the acting admin (for audit trail)
   * @returns The created role with its permissions
   */
  async createRole(
    churchId: string,
    input: CreateRoleInput,
    actorUserId?: string,
  ): Promise<RoleWithPermissions> {
    const roleName = this.slugifyRoleName(input.label);

    if ((RESERVED_ROLE_NAMES as readonly string[]).includes(roleName)) {
      throw new ConflictException(
        `"${input.label}" conflicts with the built-in role "${roleName}". Please choose a different name.`,
      );
    }

    const existing = await this.findRoleRecord(churchId, roleName);
    if (existing) {
      throw new ConflictException(
        `A role named "${roleName}" already exists${existing.church_id ? ' in your church' : ' as a built-in role'}.`,
      );
    }

    const validPermissionIds = await this.assertPermissionsExist(input.permissionIds ?? []);

    const role = await this.prisma.role.create({
      data: {
        church_id: churchId,
        name: roleName,
        label: input.label.trim(),
        description: input.description?.trim() || null,
        ...(validPermissionIds.length > 0 && {
          permissions: {
            create: validPermissionIds.map((permissionId) => ({ permission_id: permissionId })),
          },
        }),
      },
      select: { id: true, name: true, label: true, description: true },
    });

    await this.audit.log({
      userId: actorUserId ?? '',
      churchId,
      entity: 'role',
      action: 'CREATE',
      entityId: role.id,
      newValues: {
        name: role.name,
        label: role.label,
        description: role.description,
        permissions: validPermissionIds.length,
      },
    });

    this.logger.log(`Created custom role ${roleName} for church ${churchId}`);
    return this.getRolePermissions(churchId, role.name);
  }

  /**
   * Gets all roles visible to a church — its own custom roles plus every
   * global template — with their effective permissions. A church-owned role
   * shadows the global template of the same name.
   *
   * @param churchId - Church ID
   * @returns Array of roles with their permissions and status flags
   */
  async getRolesSummary(churchId: string): Promise<RoleWithPermissions[]> {
    const [roles, permissions, churchOverrides] = await Promise.all([
      this.prisma.role.findMany({
        where: { OR: [{ church_id: churchId }, { church_id: null }] },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          church_id: true,
          name: true,
          label: true,
          description: true,
        },
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

    // Merge by name — church-owned entries win over global templates.
    const rolesByName = new Map<
      string,
      {
        id: string;
        church_id: string | null;
        name: string;
        label: string | null;
        description: string | null;
      }
    >();
    for (const role of roles) {
      const current = rolesByName.get(role.name);
      if (!current || (current.church_id === null && role.church_id !== null)) {
        rolesByName.set(role.name, role);
      }
    }

    // Build a set of customized (template) roles from the override table.
    const customizedRoles = new Set(
      churchOverrides
        .map((o: { role_name: string }) => o.role_name)
        .filter((name) => rolesByName.get(name)?.church_id === null),
    );

    // Build church override maps per role (templates only).
    const overrideMap = new Map<string, Set<string>>();
    for (const override of churchOverrides) {
      const roleName = override.role_name;
      if (rolesByName.get(roleName)?.church_id !== null) continue;
      if (!overrideMap.has(roleName)) {
        overrideMap.set(roleName, new Set());
      }
      overrideMap.get(roleName)!.add(override.permission_id);
    }

    // Build global default permission maps per role (templates only).
    const rolePermissions = await this.prisma.rolePermission.findMany({
      include: {
        role: { select: { name: true, church_id: true } },
        permission: { select: { id: true } },
      },
    });
    const defaultMap = new Map<string, Set<string>>();
    for (const rp of rolePermissions) {
      if (rp.role.church_id !== null) continue;
      const roleName = rp.role.name;
      if (!defaultMap.has(roleName)) {
        defaultMap.set(roleName, new Set());
      }
      defaultMap.get(roleName)!.add(rp.permission.id);
    }

    // Owned roles resolve their absolute permission set directly.
    const ownedPermissionIds = await this.prisma.rolePermission.findMany({
      where: { role: { church_id: churchId } },
      select: { role: { select: { name: true } }, permission_id: true },
    });
    const ownedMap = new Map<string, Set<string>>();
    for (const rp of ownedPermissionIds) {
      if (!ownedMap.has(rp.role.name)) {
        ownedMap.set(rp.role.name, new Set());
      }
      ownedMap.get(rp.role.name)!.add(rp.permission_id);
    }

    return [...rolesByName.values()].map((role) => {
      const isOwned = role.church_id !== null;

      let effectiveIds: Set<string>;
      if (isOwned) {
        effectiveIds = ownedMap.get(role.name) ?? new Set<string>();
      } else {
        effectiveIds = new Set<string>(defaultMap.get(role.name) || new Set<string>());
        const roleOverrides = overrideMap.get(role.name);
        if (roleOverrides) {
          for (const id of roleOverrides) {
            effectiveIds.add(id);
          }
        }
      }

      const rolePerms = permissions.filter((p: PermissionDto) => effectiveIds.has(p.id));

      return {
        roleName: role.name,
        label: role.label,
        description: role.description,
        permissions: rolePerms,
        isCustomized: !isOwned && customizedRoles.has(role.name),
        isChurchOwned: isOwned,
      };
    });
  }

  /**
   * Gets permissions for a specific role in a church. A church-owned role
   * takes precedence over the global template of the same name.
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   * @returns Role with permissions and status flags
   */
  async getRolePermissions(churchId: string, roleName: string): Promise<RoleWithPermissions> {
    const role = await this.findRoleRecord(churchId, roleName);

    if (!role) {
      throw new NotFoundException(`Role "${roleName}" not found`);
    }

    const isOwned = role.church_id !== null;

    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, name: true, resource: true, action: true },
    });

    let effectiveIds: Set<string>;
    let isCustomized = false;

    if (isOwned) {
      const ownedPerms = await this.prisma.rolePermission.findMany({
        where: { role_id: role.id },
        select: { permission_id: true },
      });
      effectiveIds = new Set(ownedPerms.map((p: { permission_id: string }) => p.permission_id));
    } else {
      const [defaultPerms, overrideIds] = await Promise.all([
        this.prisma.rolePermission.findMany({
          where: { role: { name: roleName, church_id: null } },
          select: { permission_id: true },
        }),
        this.prisma.churchRolePermission.findMany({
          where: { church_id: churchId, role_name: roleName },
          select: { permission_id: true },
        }),
      ]);

      isCustomized = overrideIds.length > 0;

      // Merge: start with global defaults, then add church overrides (additive)
      effectiveIds = new Set<string>(
        defaultPerms.map((p: { permission_id: string }) => p.permission_id),
      );
      for (const o of overrideIds) {
        effectiveIds.add(o.permission_id);
      }
    }

    const rolePerms = permissions.filter((p: PermissionDto) => effectiveIds.has(p.id));

    return {
      roleName: role.name,
      label: role.label,
      description: role.description,
      permissions: rolePerms,
      isCustomized,
      isChurchOwned: isOwned,
    };
  }

  /**
   * Sets permissions for a role in a church (church_admin only).
   *
   * For a church-owned role this replaces its absolute permission set.
   * For a global template this replaces the church's additive overrides on
   * top of the seeded defaults.
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
      throw new BadRequestException('Cannot modify super_admin permissions (locked to ALL)');
    }

    const role = await this.findRoleRecord(churchId, roleName);
    if (!role) {
      throw new NotFoundException(`Role "${roleName}" not found`);
    }

    const validPermissionIds = await this.assertPermissionsExist(permissionIds);
    const isOwned = role.church_id !== null;

    if (isOwned) {
      // Absolute replacement of the role's own permission set.
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { role_id: role.id } }),
        ...validPermissionIds.map((permissionId: string) =>
          this.prisma.rolePermission.create({
            data: { role_id: role.id, permission_id: permissionId },
          }),
        ),
      ]);
    } else {
      // Prevent removing critical permissions from the church_admin template.
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
          .filter((p) => validPermissionIds.includes(p.id))
          .map((p) => p.name);
        const missing = REQUIRED_ADMIN_PERMISSIONS.filter((p) => !providedNames.includes(p));
        if (missing.length > 0) {
          throw new BadRequestException(
            `church_admin must always have these permissions: ${missing.join(', ')}`,
          );
        }
      }

      // Replace the church's additive overrides for this template.
      await this.prisma.$transaction([
        this.prisma.churchRolePermission.deleteMany({
          where: { church_id: churchId, role_name: roleName },
        }),
        ...validPermissionIds.map((permissionId: string) =>
          this.prisma.churchRolePermission.create({
            data: {
              church_id: churchId,
              role_name: roleName,
              permission_id: permissionId,
            },
          }),
        ),
      ]);
    }

    await this.invalidateCache(churchId, roleName);
    this.logger.log(
      `Permissions updated for ${roleName} in church ${churchId}: ${validPermissionIds.length} permissions (${isOwned ? 'owned' : 'template'})`,
    );
  }

  /**
   * Resets a global-template role to its defaults (deletes all church overrides).
   *
   * @param churchId - Church ID
   * @param roleName - Role name
   */
  async resetRoleToDefaults(churchId: string, roleName: string): Promise<void> {
    if (roleName === 'super_admin') {
      throw new BadRequestException('Cannot reset super_admin (always uses ALL permissions)');
    }

    const role = await this.findRoleRecord(churchId, roleName);
    if (!role) {
      throw new NotFoundException(`Role "${roleName}" not found`);
    }
    if (role.church_id !== null) {
      throw new BadRequestException(
        `Custom roles have no defaults to reset — edit their permissions directly.`,
      );
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
   * Finds the role visible to a church for a given name — a church-owned
   * role takes precedence over the global template.
   */
  private async findRoleRecord(
    churchId: string,
    roleName: string,
  ): Promise<{
    id: string;
    church_id: string | null;
    name: string;
    label: string | null;
    description: string | null;
  } | null> {
    const candidates = await this.prisma.role.findMany({
      where: { name: roleName, OR: [{ church_id: churchId }, { church_id: null }] },
      select: { id: true, church_id: true, name: true, label: true, description: true },
    });
    return (
      candidates.find((r) => r.church_id === churchId) ??
      candidates.find((r) => r.church_id === null) ??
      null
    );
  }

  /**
   * Slugifies a friendly label into a valid role name ("Media Team" →
   * "media_team") and validates the result.
   */
  private slugifyRoleName(label: string): string {
    const slug = label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
      .replace(/_+$/g, '');

    if (!ROLE_NAME_PATTERN.test(slug)) {
      throw new BadRequestException(
        `"${label}" does not produce a valid role name (lowercase letters, numbers and underscores, starting with a letter, 3–40 characters).`,
      );
    }
    return slug;
  }

  /**
   * Ensures every provided permission ID exists, returning the deduplicated
   * valid list.
   */
  private async assertPermissionsExist(permissionIds: string[]): Promise<string[]> {
    const unique = [...new Set(permissionIds)];
    if (unique.length === 0) return [];

    const found = await this.prisma.permission.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((p: { id: string }) => p.id));
      const unknown = unique.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Unknown permission IDs: ${unknown.join(', ')}`);
    }
    return unique;
  }

  /**
   * Resolves effective permissions for a role in a church.
   *
   * Global templates start with their seeded defaults plus additive church
   * overrides; church-owned roles use their stored permission set directly.
   */
  private async resolvePermissions(churchId: string, roleName: string): Promise<string[]> {
    const role = await this.findRoleRecord(churchId, roleName);
    if (!role) return [];

    if (role.church_id !== null) {
      const owned = await this.prisma.rolePermission.findMany({
        where: { role_id: role.id },
        include: { permission: { select: { name: true } } },
      });
      return owned.map((d: RolePermission & { permission: { name: string } }) => d.permission.name);
    }

    const [defaults, overrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { name: roleName, church_id: null } },
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
