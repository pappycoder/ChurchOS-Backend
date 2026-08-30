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
  { name: 'cell_leader', description: 'Cell group leader with shared asset management access' },
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
    // Cell Groups — read
    'cell_groups:read',
    // Members — read
    'members:read',
    // Giving — read
    'giving:read',
    // Emails — read
    'emails:read',
  ],

  member: [
    // Members — read (own profile only, enforced at service level)
    'members:read',
    // Events — read
    'events:read',
    // Sermons — read
    'sermons:read',
    // Media — read
    'media:read',
    // Profiles — read
    'profiles:read',
    // Giving — read (own transactions, enforced at service level)
    'giving:read',
    // Church — read
    'church:read',
    // Families — read
    'families:read',
  ],
};

/**
 * Seeds all roles, permissions, and default role-permission mappings.
 *
 * This function is idempotent — running it multiple times will not create
 * duplicate records. Existing roles/permissions are upserted.
 *
 * @param prisma - PrismaClient instance
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  console.log('\n🔐 Seeding roles, permissions, and default mappings...');

  // ─── 1. Create Roles ──────────────────────────────────────
  console.log('  📦 Creating roles...');
  const createdRoles: { id: string; name: string }[] = [];
  for (const role of DEFAULT_ROLES) {
    // Roles are unique per (church_id, name); templates have church_id = null.
    // The compound-unique filter cannot express NULL in this Prisma version,
    // so look up explicitly instead of upsert.
    const existing = await prisma.role.findFirst({
      where: { name: role.name, church_id: null },
      select: { id: true, name: true },
    });
    const created = existing
      ? await prisma.role.update({
          where: { id: existing.id },
          data: { description: role.description },
        })
      : await prisma.role.create({ data: { name: role.name, description: role.description } });
    createdRoles.push(created);
    console.log(`    ✅ Role: ${created.name}`);
  }

  // ─── 2. Create Permissions ────────────────────────────────
  console.log('  📦 Creating permissions...');
  const allPermissions = generateAllPermissions();
  const createdPermissions: { id: string; name: string }[] = [];

  for (const perm of allPermissions) {
    const created = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: {
        name: perm.name,
        resource: perm.resource,
        action: perm.action,
      },
    });
    createdPermissions.push(created);
  }
  console.log(
    `    ✅ Permissions: ${createdPermissions.length} (${RESOURCES.length} resources × ${ACTIONS.length} actions)`,
  );

  // ─── 3. Assign Default Permissions to Roles ──────────────
  console.log('  📦 Assigning default permissions to roles...');

  // super_admin gets ALL permissions (locked — always everything)
  const superAdminRole = createdRoles.find((r) => r.name === 'super_admin');
  if (superAdminRole) {
    for (const perm of createdPermissions) {
      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: superAdminRole.id, permission_id: perm.id } },
        update: {},
        create: { role_id: superAdminRole.id, permission_id: perm.id },
      });
    }
    console.log(
      `    ✅ Assigned ${createdPermissions.length} permissions to super_admin (ALL — locked)`,
    );
  }

  // Other roles get permissions from the matrix
  for (const [roleName, permissions] of Object.entries(DEFAULT_PERMISSION_MATRIX)) {
    if (roleName === 'super_admin') continue; // Already handled above

    const role = createdRoles.find((r) => r.name === roleName);
    if (!role) {
      console.warn(`    ⚠️  Role "${roleName}" not found in created roles, skipping`);
      continue;
    }

    let assignedCount = 0;
    for (const permName of permissions) {
      const perm = createdPermissions.find((p) => p.name === permName);
      if (!perm) {
        console.warn(`    ⚠️  Permission "${permName}" not found, skipping`);
        continue;
      }

      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
        update: {},
        create: { role_id: role.id, permission_id: perm.id },
      });
      assignedCount++;
    }
    console.log(`    ✅ Assigned ${assignedCount} permissions to ${roleName}`);
  }

  // ─── Summary ─────────────────────────────────────────────
  const totalRolePermissions = await prisma.rolePermission.count();
  console.log(
    `\n  🎉 Permissions seed complete: ${createdRoles.length} roles, ${createdPermissions.length} permissions, ${totalRolePermissions} role-permission mappings`,
  );
}
