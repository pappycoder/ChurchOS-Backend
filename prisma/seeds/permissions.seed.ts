/**
 * @file permissions.seed.ts
 * @description Default roles, permissions, and role-permission mappings seed data.
 *
 * Seeds 8 roles and ~100 permissions (25 resources x 4 actions) with
 * default role-permission assignments. Churches start with these defaults
 * and can customize via the church_admin permissions API.
 *
 * The `super_admin` role is always locked to ALL permissions.
 *
 * Usage:
 *   Import `seedPermissions` into `prisma/seed.ts` and call it.
 *
 * @module seeds/permissions
 * @since 1.0.0
 */

import { PrismaClient } from '@prisma/client';

// ─── Role Definitions ──────────────────────────────────────

export interface RoleSeed {
  name: string;
  description: string;
}

export const DEFAULT_ROLES: RoleSeed[] = [
  { name: 'super_admin', description: 'Platform administrator with full access (locked)' },
  { name: 'senior_pastor', description: 'Senior/lead pastor with near-full access' },
  { name: 'church_admin', description: 'Church administrator with full access' },
  { name: 'branch_pastor', description: 'Branch/campus pastor with limited admin access' },
  { name: 'department_head', description: 'Department leader with read-heavy access' },
  { name: 'secretary', description: 'Church secretary with member and event management access' },
  { name: 'treasurer', description: 'Financial officer with giving and reports access' },
  {
    name: 'cell_leader',
    description:
      'Cell group leader who records attendance for their own group and follows up on visitors',
  },
  { name: 'member', description: 'Regular church member with read-only access' },
];

// ─── Resource Definitions ──────────────────────────────────

export const RESOURCES = [
  'members',
  'attendance',
  'giving',
  'events',
  'sermons',
  'media',
  'church',
  'branches',
  'profiles',
  'whatsapp',
  'reports',
  'forms',
  'pastoral',
  'departments',
  'cell_groups',
  'assets',
  'families',
  'templates',
  'broadcasts',
  'analytics',
  'church_settings',
  'visitors',
  'users',
  'emails',
  'appointments',
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['create', 'read', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Generates all permission names in the format `resource:action`.
 */
export function generateAllPermissions(): { name: string; resource: string; action: string }[] {
  const permissions: { name: string; resource: string; action: string }[] = [];
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      permissions.push({
        name: `${resource}:${action}`,
        resource,
        action,
      });
    }
  }
  return permissions;
}

// ─── Default Permission Matrix ─────────────────────────────
// Each role maps to an array of `resource:action` permission strings.
// `super_admin` is handled separately (always ALL permissions, locked).

export const DEFAULT_PERMISSION_MATRIX: Record<string, string[]> = {
  senior_pastor: [
    // Members — full access
    'members:create',
    'members:read',
    'members:update',
    'members:delete',
    // Attendance — full access
    'attendance:create',
    'attendance:read',
    'attendance:update',
    'attendance:delete',
    // Giving — full access
    'giving:create',
    'giving:read',
    'giving:update',
    'giving:delete',
    // Events — full access
    'events:create',
    'events:read',
    'events:update',
    'events:delete',
    // Sermons — full access
    'sermons:create',
    'sermons:read',
    'sermons:update',
    'sermons:delete',
    // Media — full access
    'media:create',
    'media:read',
    'media:update',
    'media:delete',
    // Church — read + update
    'church:read',
    'church:update',
    // Branches — full access
    'branches:create',
    'branches:read',
    'branches:update',
    'branches:delete',
    // Profiles — full access
    'profiles:create',
    'profiles:read',
    'profiles:update',
    'profiles:delete',
    // WhatsApp — full access
    'whatsapp:create',
    'whatsapp:read',
    'whatsapp:update',
    'whatsapp:delete',
    // Reports — full access
    'reports:create',
    'reports:read',
    'reports:update',
    'reports:delete',
    // Forms — full access
    'forms:create',
    'forms:read',
    'forms:update',
    'forms:delete',
    // Pastoral — full access
    'pastoral:create',
    'pastoral:read',
    'pastoral:update',
    'pastoral:delete',
    // Departments — full access
    'departments:create',
    'departments:read',
    'departments:update',
    'departments:delete',
    // Cell Groups — full access
    'cell_groups:create',
    'cell_groups:read',
    'cell_groups:update',
    'cell_groups:delete',
    // Assets — full access
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    // Families — full access
    'families:create',
    'families:read',
    'families:update',
    'families:delete',
    // Templates — full access
    'templates:create',
    'templates:read',
    'templates:update',
    'templates:delete',
    // Broadcasts — full access
    'broadcasts:create',
    'broadcasts:read',
    'broadcasts:update',
    'broadcasts:delete',
    // Analytics — read
    'analytics:read',
    // Church Settings — read + update
    'church_settings:read',
    'church_settings:update',
    // Visitors — full access
    'visitors:create',
    'visitors:read',
    'visitors:update',
    'visitors:delete',
    // Users — full access
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    // Emails — full access
    'emails:create',
    'emails:read',
    'emails:update',
    'emails:delete',
    // Appointments — full access
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'appointments:delete',
  ],

  church_admin: [
    // ALL permissions (same as super_admin, but not locked)
    ...RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`)),
  ],

  branch_pastor: [
    // Members — read + update
    'members:read',
    'members:update',
    // Attendance — create + read + update
    'attendance:create',
    'attendance:read',
    'attendance:update',
    // Giving — read
    'giving:read',
    // Events — create + read + update
    'events:create',
    'events:read',
    'events:update',
    // Sermons — create + read + update
    'sermons:create',
    'sermons:read',
    'sermons:update',
    // Media — create + read
    'media:create',
    'media:read',
    // Church — read
    'church:read',
    // Branches — read
    'branches:read',
    // Profiles — read
    'profiles:read',
    // WhatsApp — read
    'whatsapp:read',
    // Reports — read
    'reports:read',
    // Forms — read
    'forms:read',
    // Pastoral — create + read + update
    'pastoral:create',
    'pastoral:read',
    'pastoral:update',
    // Departments — read
    'departments:read',
    // Cell Groups — create + read + update
    'cell_groups:create',
    'cell_groups:read',
    'cell_groups:update',
    // Assets — create + read + update
    'assets:create',
    'assets:read',
    'assets:update',
    // Families — create + read + update
    'families:create',
    'families:read',
    'families:update',
    // Templates — create + read
    'templates:create',
    'templates:read',
    // Broadcasts — create + read
    'broadcasts:create',
    'broadcasts:read',
    // Analytics — read
    'analytics:read',
    // Visitors — create + read + update
    'visitors:create',
    'visitors:read',
    'visitors:update',
    // Users — read
    'users:read',
    // Emails — full access
    'emails:create',
    'emails:read',
    'emails:update',
    // Appointments — full access
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'appointments:delete',
  ],

  department_head: [
    // Members — read
    'members:read',
    // Users — read
    'users:read',
    // Attendance — create + read
    'attendance:create',
    'attendance:read',
    // Giving — read
    'giving:read',
    // Events — read
    'events:read',
    // Media — read
    'media:read',
    // Cell Groups — read
    'cell_groups:read',
    // Families — read
    'families:read',
    // Visitors — read
    'visitors:read',
    // Assets — read
    'assets:read',
    // Emails — read
    'emails:read',
  ],

  secretary: [
    // Members — create + read + update
    'members:create',
    'members:read',
    'members:update',
    // Attendance — create + read + update
    'attendance:create',
    'attendance:read',
    'attendance:update',
    // Giving — read
    'giving:read',
    // Events — create + read + update
    'events:create',
    'events:read',
    'events:update',
    // Church — read
    'church:read',
    // Branches — read
    'branches:read',
    // Profiles — read
    'profiles:read',
    // Forms — create + read + update
    'forms:create',
    'forms:read',
    'forms:update',
    // Families — create + read + update
    'families:create',
    'families:read',
    'families:update',
    // Templates — create + read
    'templates:create',
    'templates:read',
    // Visitors — create + read + update
    'visitors:create',
    'visitors:read',
    'visitors:update',
    // Pastoral — read
    'pastoral:read',
    // Reports — read
    'reports:read',
    // Assets — create + read + update
    'assets:create',
    'assets:read',
    'assets:update',
    // Cell Groups — read + create (attendance recording)
    'cell_groups:read',
    'cell_groups:create',
    // Users — read
    'users:read',
    // Emails — full access
    'emails:create',
    'emails:read',
    'emails:update',
    // Appointments — full access
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'appointments:delete',
  ],

  treasurer: [
    // Giving — create + read + update
    'giving:create',
    'giving:read',
    'giving:update',
    // Reports — read
    'reports:read',
    // Assets — create + read + update + delete
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    // Church Settings — read
    'church_settings:read',
    // Members — read
    'members:read',
    // Analytics — read
    'analytics:read',
    // Users — read
    'users:read',
    // Emails — read
    'emails:read',
  ],

  cell_leader: [
    // Assets — create + read + update
    'assets:create',
    'assets:read',
    'assets:update',
    // Cell Groups — read + create (attendance recording for their own group)
    'cell_groups:read',
    'cell_groups:create',
    // Events — read (tickets + branch-wide event list)
    'events:read',
    // Visitors — create + read (branch-scoped follow-up)
    'visitors:read',
    'visitors:create',
    // Members — read
    'members:read',
    // Giving — read
    'giving:read',
    // Emails — read
    'emails:read',
  ],

  member: [
    // Events — read
    'events:read',
    // Sermons — read
    'sermons:read',
    // Media — read
    'media:read',
    // Profiles — read
    'profiles:read',
    // Church — read
    'church:read',
  ],
};

/**
 * Seeds all roles, permissions, and default role-permission mappings.
 *
 * Idempotent — running it multiple times will not create duplicate records.
 * Batched with `createMany({ skipDuplicates: true })` (and filtered
 * findMany/createMany for the per-church NULL-templated roles), so the whole
 * module runs in ~8 queries instead of ~500 sequential round trips — the old
 * per-row upsert loop took minutes and would abort against remote/pooled
 * databases.
 *
 * @param prisma - PrismaClient instance
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  console.log('\n🔐 Seeding roles, permissions, and default mappings...');

  // ─── 1. Create Roles ──────────────────────────────────────
  console.log('  📦 Creating roles...');
  const roleNames = DEFAULT_ROLES.map((role) => role.name);
  // Roles are unique per (church_id, name); templates have church_id = null.
  // The compound-unique filter cannot express NULL in this Prisma version,
  // so match on church_id = null and name in one batched findMany.
  const existingRoles = await prisma.role.findMany({
    where: { church_id: null, name: { in: roleNames } },
    select: { id: true, name: true, description: true },
  });
  const existingByRoleName = new Map(existingRoles.map((r) => [r.name, r]));

  const missingRoles = DEFAULT_ROLES.filter((role) => !existingByRoleName.has(role.name));
  if (missingRoles.length > 0) {
    await prisma.role.createMany({ data: missingRoles });
  }

  // Only touch descriptions that actually changed (no wasted writes on re-runs).
  for (const role of DEFAULT_ROLES) {
    const existing = existingByRoleName.get(role.name);
    if (existing && existing.description !== role.description) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { description: role.description },
      });
    }
  }

  const allRoles = await prisma.role.findMany({
    where: { church_id: null, name: { in: roleNames } },
    select: { id: true, name: true },
  });
  for (const role of allRoles) {
    console.log(`    ✅ Role: ${role.name}`);
  }

  // ─── 2. Create Permissions ────────────────────────────────
  console.log('  📦 Creating permissions...');
  const allPermissions = generateAllPermissions();
  // One batched insert; `name` is unique so skipDuplicates ignores existing rows.
  await prisma.permission.createMany({ data: allPermissions, skipDuplicates: true });
  const createdPermissions = await prisma.permission.findMany({
    where: { name: { in: allPermissions.map((p) => p.name) } },
    select: { id: true, name: true },
  });
  const permissionIdByName = new Map(createdPermissions.map((p) => [p.name, p.id]));
  console.log(
    `    ✅ Permissions: ${createdPermissions.length} (${RESOURCES.length} resources × ${ACTIONS.length} actions)`,
  );

  // ─── 3. Assign Default Permissions to Roles ──────────────
  console.log('  📦 Assigning default permissions to roles...');
  const roleIdByName = new Map(allRoles.map((r) => [r.name, r.id]));

  const desiredMappings: { role_id: string; permission_id: string }[] = [];

  // super_admin gets ALL permissions (locked — always everything)
  const superAdminRole = roleIdByName.get('super_admin');
  if (superAdminRole) {
    for (const perm of createdPermissions) {
      desiredMappings.push({ role_id: superAdminRole, permission_id: perm.id });
    }
    console.log(
      `    ✅ Assigned ${createdPermissions.length} permissions to super_admin (ALL — locked)`,
    );
  }

  // Other roles get permissions from the matrix
  for (const [roleName, permissions] of Object.entries(DEFAULT_PERMISSION_MATRIX)) {
    if (roleName === 'super_admin') continue; // Already handled above

    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`    ⚠️  Role "${roleName}" not found in created roles, skipping`);
      continue;
    }

    let assignedCount = 0;
    for (const permName of permissions) {
      const permissionId = permissionIdByName.get(permName);
      if (!permissionId) {
        console.warn(`    ⚠️  Permission "${permName}" not found, skipping`);
        continue;
      }
      desiredMappings.push({ role_id: roleId, permission_id: permissionId });
      assignedCount++;
    }
    console.log(`    ✅ Assigned ${assignedCount} permissions to ${roleName}`);
  }

  // One batched insert; (role_id, permission_id) is unique, so duplicates are skipped.
  await prisma.rolePermission.createMany({ data: desiredMappings, skipDuplicates: true });

  // ─── Summary ─────────────────────────────────────────────
  const totalRolePermissions = await prisma.rolePermission.count();
  console.log(
    `\n  🎉 Permissions seed complete: ${allRoles.length} roles, ${createdPermissions.length} permissions, ${totalRolePermissions} role-permission mappings`,
  );
}
