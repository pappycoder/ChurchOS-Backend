/**
 * @file permissions.seed.ts
 * @description Default roles, permissions, and role-permission mappings seed data.
 *
 * Seeds 9 roles and the hierarchical surface-permission catalog:
 *   - `resource:view`                 — top-level menu visibility
 *   - `resource:action`               — coarse CRUD (create/read/update/delete)
 *   - `resource:surface:action`       — per-surface CRUD (e.g. `events:calendar:read`,
 *                                        `members:new:create`, `giving:reports:read`)
 *
 * Roles' surface grants are <em>derived</em> from their coarse grants, so a
 * role's visible menus never change: wherever a role holds `resource:create`,
 * they also hold every `resource:<surface>:create`, and wherever they hold any
 * `resource:<action>` they also hold `resource:view`. Churches start with
 * these defaults and can customize via the church_admin permissions API.
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
      'Cell group leader with member-level access plus management of their own group (edit details, members, attendance)',
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
  'roles',
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

export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;
export type CrudAction = (typeof CRUD_ACTIONS)[number];

// ─── Action Definitions ────────────────────────────────────

export const ACTIONS = ['view', ...CRUD_ACTIONS] as const;
export type Action = (typeof ACTIONS)[number];

// ─── Surface Definitions ───────────────────────────────────
// Hierarchical sub-surfaces inside a resource (mirrors sidebar submenus /
// header child items). Each surface carries the full CRUD action set as
// `resource:surface:action`. Single-page menus (templates, broadcasts,
// whatsapp/messages, emails/inbox, appointments, church/settings, analytics)
// intentionally have NO surface map — they stay coarse `resource:action`.

export const SURFACES: Partial<Record<Resource, readonly string[]>> = {
  members: ['all', 'new', 'import'],
  attendance: ['dashboard', 'services', 'checkin', 'records', 'reports'],
  giving: ['dashboard', 'categories', 'records', 'reports', 'recurring'],
  events: ['calendar', 'list', 'checkin', 'registrations', 'tickets'],
  sermons: ['list', 'new', 'series', 'speakers'],
  media: ['library', 'upload', 'folders'],
  pastoral: ['notes', 'life-events', 'risk-scores', 'engagement'],
  visitors: ['list', 'new', 'followup'],
  assets: ['list', 'categories', 'maintenance', 'loans'],
  forms: ['list', 'submissions'],
};

/**
 * Generates the full permission catalog:
 *  - `resource:view` for every resource
 *  - coarse `resource:action` for every CRUD action
 *  - `resource:surface:action` for every surface × CRUD action
 * `resource` stores the nested path (`events:calendar`) and `action` the
 * final segment, so exact-string set membership still works end-to-end.
 */
export function generateAllPermissions(): { name: string; resource: string; action: string }[] {
  const permissions: { name: string; resource: string; action: string }[] = [];
  for (const resource of RESOURCES) {
    permissions.push({ name: `${resource}:view`, resource, action: 'view' });
    for (const action of CRUD_ACTIONS) {
      permissions.push({ name: `${resource}:${action}`, resource, action });
    }
    for (const surface of SURFACES[resource] ?? []) {
      for (const action of CRUD_ACTIONS) {
        permissions.push({
          name: `${resource}:${surface}:${action}`,
          resource: `${resource}:${surface}`,
          action,
        });
      }
    }
  }
  return permissions;
}

/**
 * Derives hierarchical grants from a role's coarse grant set so its visible
 * menus never change:
 *  - holding any `resource:<action>` grants `resource:view`
 *  - holding `resource:<action>` grants the same `<action>` on every surface
 *    (`resource:<surface>:<action>`)
 */
export function expandPermissions(base: string[]): string[] {
  const expanded = new Set(base);
  for (const resource of RESOURCES) {
    const actions = new Set<string>();
    for (const code of base) {
      const parts = code.split(':');
      if (parts.length === 2 && parts[0] === resource) actions.add(parts[1]);
    }
    if (actions.size === 0) continue;
    expanded.add(`${resource}:view`);
    const surfaces = SURFACES[resource] ?? [];
    for (const surface of surfaces) {
      for (const action of CRUD_ACTIONS) {
        if (actions.has(action)) {
          expanded.add(`${resource}:${surface}:${action}`);
        }
      }
    }
  }
  return [...expanded];
}

// ─── Default Permission Matrix ─────────────────────────────
// Each role maps to an array of coarse `resource:action` permission strings.
// The exported DEFAULT_PERMISSION_MATRIX is the raw set passed through
// `expandPermissions`, which adds `resource:view` + surface grants derived
// from the coarse grants — so per-role visible menus never change.
// `super_admin` is handled separately (always ALL permissions, locked).

const RAW_DEFAULT_PERMISSION_MATRIX: Record<string, string[]> = {
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
    // Analytics — view + read
    'analytics:view',
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
    ...generateAllPermissions().map((p) => p.name),
    // Roles & permissions management (menus + API):
    'roles:read',
    'roles:update',
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
    // Forms — create + read + update
    'forms:create',
    'forms:read',
    'forms:update',
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
    // Analytics — view + read
    'analytics:view',
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
    // Member floor — read (everything a normal member can see/do)
    'sermons:read',
    'profiles:read',
    'church:read',
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
    // Member floor — read (everything a normal member can see/do)
    'sermons:read',
    'media:read',
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
    // Member floor — read (everything a normal member can see/do)
    'events:read',
    'sermons:read',
    'media:read',
    'profiles:read',
    'church:read',
    // Analytics — view + read
    'analytics:view',
    'analytics:read',
    // Users — read
    'users:read',
    // Emails — read
    'emails:read',
  ],

  cell_leader: [
    // Events — read (member parity)
    'events:read',
    // Sermons — read (member parity)
    'sermons:read',
    // Media — read (member parity)
    'media:read',
    // Profiles — read (member parity)
    'profiles:read',
    // Church — read (member parity)
    'church:read',
    // Cell Groups — read + create + update (the ONLY additions over member:
    // editing their own group, adding/removing members, and recording
    // attendance — all enforced to their OWN group server-side)
    'cell_groups:read',
    'cell_groups:create',
    'cell_groups:update',
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

// Every role's effective grants = coarse matrix + derived hierarchical grants.
export const DEFAULT_PERMISSION_MATRIX: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW_DEFAULT_PERMISSION_MATRIX).map(([role, perms]) => [
    role,
    expandPermissions(perms),
  ]),
);

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
  const surfaceCount = Object.values(SURFACES).reduce((sum, s) => sum + s.length, 0);
  console.log(
    `    ✅ Permissions: ${createdPermissions.length} (${RESOURCES.length} resources × ${CRUD_ACTIONS.length} coarse actions + ${surfaceCount} surfaces)`,
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

  // ─── 4. Reconcile (remove stale mappings) ────────────────
  // The seed is template-driven: every template role's grants must EXACTLY
  // match its DEFAULT_PERMISSION_MATRIX entry. Because the insert above is
  // additive-only, permissions removed from a template would linger forever —
  // so delete mappings for these null-church template roles that are not in
  // the desired set. super_admin stays locked to ALL (never reconciled);
  // per-church custom roles are untouched (they live on RolePermission with
  // a non-null church_id and are not addressed by roleIdByName).
  for (const [roleName, permissions] of Object.entries(DEFAULT_PERMISSION_MATRIX)) {
    if (roleName === 'super_admin') continue; // Locked — always everything

    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      console.warn(`    ⚠️  Role "${roleName}" not found, skipping reconciliation`);
      continue;
    }

    const desiredIds = permissions
      .map((permName) => permissionIdByName.get(permName))
      .filter((id): id is string => Boolean(id));

    const deleted = await prisma.rolePermission.deleteMany({
      where: {
        role_id: roleId,
        permission_id: { notIn: desiredIds },
      },
    });
    if (deleted.count > 0) {
      console.log(`    🧹 Removed ${deleted.count} stale permissions from ${roleName}`);
    }
  }

  // ─── Summary ─────────────────────────────────────────────
  const totalRolePermissions = await prisma.rolePermission.count();
  console.log(
    `\n  🎉 Permissions seed complete: ${allRoles.length} roles, ${createdPermissions.length} permissions, ${totalRolePermissions} role-permission mappings`,
  );
}
