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
  {
    name: 'senior_pastor',
    description:
      'Pastor with all operational pages, scoped to their branch unless Admin HQ is enabled',
  },
  { name: 'church_admin', description: 'Church administrator with full access' },
  {
    name: 'branch_pastor',
    description:
      'Pastor with all operational pages, scoped to their branch unless Admin HQ is enabled',
  },
  {
    name: 'department_head',
    description:
      'Department leader with member-level access plus management of their own department',
  },
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
  'pastoral_confidential',
  'pastoral_restricted',
  'pastoral_moderation',
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
  'webhooks',
  'diagnostics',
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
  members: ['all', 'new', 'import', 'own'],
  attendance: ['dashboard', 'services', 'checkin', 'records', 'reports'],
  giving: ['dashboard', 'categories', 'records', 'reports', 'recurring'],
  events: ['calendar', 'all', 'list', 'checkin', 'registrations', 'tickets', 'ticket-records'],
  sermons: ['list', 'new', 'series', 'speakers'],
  media: ['library', 'upload', 'folders'],
  pastoral: ['notes', 'life-events', 'risk-scores', 'engagement'],
  visitors: ['list', 'new', 'followup'],
  assets: ['list', 'categories', 'maintenance', 'loans'],
  forms: ['list', 'submissions'],
  departments: ['own'],
  cell_groups: ['own'],
  reports: ['financial', 'attendance', 'members'],
  analytics: ['dashboard', 'giving', 'attendance', 'members', 'events', 'communication'],
  appointments: ['branch'],
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
  permissions.push({
    name: 'branches:directory:read',
    resource: 'branches:directory',
    action: 'read',
  });
  permissions.push({
    name: 'data_scope:church:read',
    resource: 'data_scope:church',
    action: 'read',
  });
  permissions.push({ name: 'media:restricted:read', resource: 'media:restricted', action: 'read' });
  return permissions;
}

/**
 * Derives hierarchical grants from a role's coarse grant set so its visible
 * menus never change:
 *  - holding any `resource:<action>` grants `resource:view`
 *  - holding `resource:<action>` grants the same `<action>` on every regular
 *    surface (`resource:<surface>:<action>`)
 *  - `own` surfaces are explicit scope grants and are never inferred from a
 *    church-wide resource permission
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
      if (surface === 'own' || surface === 'ticket-records') continue;
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

// Pastors can use every operational page. Church configuration, branch
// creation and church-wide account/permission administration stay admin-only.
const pastorPermissions = generateAllPermissions()
  .map((permission) => permission.name)
  .filter((name) => {
    const [resource, action] = name.split(':');
    if (resource === 'church_settings' || resource === 'data_scope') return false;
    if (name === 'branches:create') return false;
    if (['church', 'roles', 'users', 'profiles', 'webhooks', 'diagnostics'].includes(resource)) {
      return action === 'read' || action === 'view';
    }
    return !name.includes(':own:');
  });

const RAW_DEFAULT_PERMISSION_MATRIX: Record<string, string[]> = {
  senior_pastor: [...pastorPermissions],

  church_admin: [
    // ALL permissions (same as super_admin, but not locked)
    ...generateAllPermissions().map((p) => p.name),
    // Roles & permissions management (menus + API):
    'roles:create',
    'roles:read',
    'roles:update',
  ],

  branch_pastor: [...pastorPermissions],

  department_head: [
    'members:own:read',
    // Branch names are needed for the locked branch selector; the API only
    // returns this viewer's own branch unless is_admin_hq is enabled.
    'branches:read',
    // Ticket booking — read event listings and claim/view personal tickets.
    // Separate grants keep staff-only event and registration menus hidden.
    'events:calendar:read',
    'events:list:read',
    'events:tickets:read',
    'sermons:read',
    'sermons:new:create',
    'media:read',
    'media:create',
    'media:update',
    'profiles:read',
    'church:read',
    // Departments — create church-wide when the viewer has HQ scope; the API
    // rejects creation for branch-scoped heads and keeps their edit scope own-only.
    'departments:read',
    'departments:create',
    'departments:update',
    'departments:own:read',
    'departments:own:update',
  ],

  secretary: [
    // Members — create + read + update
    'members:create',
    'members:read',
    'members:update',
    // Attendance — dashboard, services, and report only (no check-in or records)
    'attendance:dashboard:read',
    'attendance:services:read',
    'attendance:services:create',
    'attendance:reports:read',
    // Giving — dashboard and categories only; categories may be created
    'giving:dashboard:read',
    'giving:categories:read',
    'giving:categories:create',
    // Events — calendar, event listing, and registrations; no check-in access
    'events:calendar:read',
    'events:list:read',
    'events:registrations:read',
    'events:tickets:read',
    'events:ticket-records:read',
    'events:tickets:create',
    // Sermons and media — content management within the viewer's branch scope
    'sermons:create',
    'sermons:read',
    'sermons:update',
    'sermons:delete',
    'media:create',
    'media:read',
    'media:update',
    'media:delete',
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
    // Reports — all three report types
    'reports:view',
    'reports:financial:read',
    'reports:attendance:read',
    'reports:members:read',
    // Assets — create + read + update
    'assets:create',
    'assets:read',
    'assets:update',
    // Departments and cell groups — branch-scoped read access
    'departments:read',
    'cell_groups:read',
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
    // Branch names are needed for HQ branch filters; branch-scoped viewers
    // only receive their own branch from the API.
    'branches:read',
    // Department names are needed when creating branch assets.
    'departments:read',
    // Giving — create + read + update
    'giving:create',
    'giving:read',
    'giving:update',
    // Giving records use the service list for the service filter dropdown.
    'attendance:services:read',
    // Reports — financial only
    'reports:view',
    'reports:financial:read',
    // Assets — create + read + update + delete
    'assets:create',
    'assets:read',
    'assets:update',
    'assets:delete',
    // Church Settings — read
    'church_settings:read',
    // Calendar and personal ticket booking. Listing access feeds the booking
    // flow; the separate all-menu permission is intentionally not granted.
    'events:calendar:read',
    'events:list:read',
    'events:tickets:read',
    'sermons:read',
    'media:read',
    'profiles:read',
    'church:read',
    // Analytics — giving only
    'analytics:giving:read',
    // Inbox access includes composing messages.
    'emails:read',
    'emails:create',
  ],

  cell_leader: [
    'members:own:read',
    'branches:read',
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
    'cell_groups:own:read',
    'cell_groups:read',
    'cell_groups:create',
    'cell_groups:update',
    'cell_groups:own:create',
    'cell_groups:own:update',
  ],

  member: [
    'members:own:read',
    'branches:read',
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
    // All roles need to resolve their own branch name for locked branch
    // filters. BranchesService limits non-HQ callers to their assigned branch.
    expandPermissions([...perms, 'branches:read']),
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
