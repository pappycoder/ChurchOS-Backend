/* eslint-disable prettier/prettier */
// Generated from the web route and plan maps. Do not edit.
/**
 * @file Central map of dashboard routes to the permission
 * required to view them. Mirrors the sidebar nav gates — keep both in sync.
 *
 * Matching is longest-prefix-first: a rule matches when the pathname equals
 * the prefix or lives beneath it (`prefix` or `prefix/...`). Unmapped routes
 * are denied. Shared authenticated pages are listed explicitly.
 */

export interface RoutePermissionRule {
  prefix: string;
  /** Required `resource:surface:action` permission, e.g. "members:all:read".
   * Single-page resources keep coarse `resource:action` codes. */
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
}

export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  // Shared pages require an active authenticated profile, without a module grant.
  { prefix: "/dashboard" },
  { prefix: "/subscription", permission: "billing:read" },
  { prefix: "/docs" },
  // Public Help Centre is also a workspace navigation destination.
  { prefix: "/help" },
  { prefix: "/help/contact-support" },
  { prefix: "/profile" },
  // Contact support shares the workspace; live chat is restricted to administrators.
  { prefix: "/support" },

  // Members
  { prefix: "/members/import", permission: "members:import:create" },
  { prefix: "/members/new", permission: "members:new:create" },
  { prefix: "/members/families", permission: "families:read" },
  { prefix: "/members", permission: "members:all:read" },

  // Attendance
  { prefix: "/attendance/check-in", permission: "attendance:checkin:create" },
  { prefix: "/attendance/services", permission: "attendance:services:read" },
  { prefix: "/attendance/records", permission: "attendance:records:read" },
  { prefix: "/attendance/reports", permission: "attendance:reports:read" },
  { prefix: "/attendance", permission: "attendance:dashboard:read" },

  // Giving
  { prefix: "/giving/categories", permission: "giving:categories:read" },
  { prefix: "/giving/records", permission: "giving:records:read" },
  { prefix: "/giving/reports", permission: "giving:reports:read" },
  { prefix: "/giving/recurring", permission: "giving:recurring:read" },
  { prefix: "/giving", permission: "giving:dashboard:read" },

  // Events
  { prefix: "/events/check-in", permission: "events:checkin:create" },
  { prefix: "/events/new", permission: "events:create" },
  { prefix: "/events/management", permission: "events:tickets:read" },
  { prefix: "/events/list", permission: "events:all:read" },
  { prefix: "/events/registrations", permission: "events:registrations:read" },
  { prefix: "/events/[eventId]/edit", permission: "events:update" },
  { prefix: "/events/[eventId]/tiers", permission: "events:tickets:read" },
  { prefix: "/events/[eventId]", permission: "events:all:read" },
  { prefix: "/events", permission: "events:calendar:read" },

  // Sermons
  { prefix: "/sermons/new", permission: "sermons:new:create" },
  { prefix: "/sermons/series", permission: "sermons:series:read" },
  { prefix: "/sermons/speakers", permission: "sermons:speakers:read" },
  { prefix: "/sermons/[sermonId]/edit", permission: "sermons:update" },
  { prefix: "/sermons", permission: "sermons:list:read" },

  // Media
  { prefix: "/media/upload", permission: "media:upload:create" },
  { prefix: "/media/folders", permission: "media:folders:read" },
  { prefix: "/media", permission: "media:library:read" },

  // Pastoral care · Visitors
  { prefix: "/pastoral/life-events", permission: "pastoral:life-events:read" },
  { prefix: "/pastoral/risk-scores", permission: "pastoral:risk-scores:read" },
  { prefix: "/pastoral/engagement", permission: "pastoral:engagement:read" },
  { prefix: "/pastoral", permission: "pastoral:notes:read" },
  { prefix: "/visitors/new", permission: "visitors:new:create" },
  { prefix: "/visitors/follow-up", permission: "visitors:list:read" },
  { prefix: "/visitors", permission: "visitors:list:read" },

  // Communication
  { prefix: "/communication/templates", permission: "templates:read" },
  { prefix: "/communication/broadcasts", permission: "broadcasts:read" },
  { prefix: "/communication/messages", permission: "whatsapp:read" },
  { prefix: "/communication/inbox", permission: "emails:read" },
  { prefix: "/appointments", permission: "appointments:read" },

  // Departments · Assets · Forms
  { prefix: "/departments/cell-groups", permission: "cell_groups:read" },
  { prefix: "/departments/[departmentId]", permission: "departments:read" },
  { prefix: "/departments", permission: "departments:read" },
  { prefix: "/assets/categories", permission: "assets:categories:read" },
  { prefix: "/assets/maintenance", permission: "assets:maintenance:read" },
  { prefix: "/assets/loans", permission: "assets:loans:read" },
  { prefix: "/assets", permission: "assets:list:read" },
  { prefix: "/forms/new", permission: "forms:list:create" },
  { prefix: "/forms/[formId]/edit", permission: "forms:list:update" },
  { prefix: "/forms/[formId]/fill", permission: "forms:list:read" },
  { prefix: "/forms/submissions", permission: "forms:submissions:read" },
  { prefix: "/forms", permission: "forms:list:read" },

  // Reports — single generator page guarded by the reports:read permission
  { prefix: "/reports", permission: "reports:view", anyOf: ["reports:financial:read", "reports:attendance:read", "reports:members:read"] },

  // Diagnostics
  { prefix: "/debug/sentry", permission: "diagnostics:read" },

  // Administration
  { prefix: "/admin/users", permission: "users:read", allOf: ["profiles:read"] },
  { prefix: "/admin/roles", permission: "roles:read" },
  { prefix: "/admin/settings", permission: "church_settings:update" },
  { prefix: "/admin/integrations", permission: "integrations:read" },
  { prefix: "/admin/branches", permission: "branches:directory:read" },

  // Analytics permissions align with the individual backend endpoints.
  { prefix: "/analytics/giving", permission: "analytics:giving:read" },
  { prefix: "/analytics/attendance", permission: "analytics:attendance:read" },
  { prefix: "/analytics/members", permission: "analytics:members:read" },
  { prefix: "/analytics", permission: "analytics:dashboard:read" },
];

// Compile once: navigation must not sort and allocate the entire rule table.
const compiledRules = ROUTE_PERMISSIONS.map((rule) => {
  const segments = rule.prefix.split("/").slice(1);
  return {
    rule,
    segments,
    staticSegments: segments.filter((segment) => !/^\[[^\]]+\]$/.test(segment)).length,
  };
}).sort((a, b) => b.segments.length - a.segments.length ||
  b.staticSegments - a.staticSegments || b.rule.prefix.length - a.rule.prefix.length);

/** Most-specific prefix match, including actual IDs in dynamic route segments. */
export function matchRoutePermission(pathname: string): RoutePermissionRule | null {
  const segments = pathname.split("/").slice(1);
  for (const { rule, segments: pattern } of compiledRules) {
    if (pattern.length > segments.length) continue;
    if (!rule.permission && !rule.anyOf?.length && pattern.length !== segments.length) continue;
    if (pattern.every((segment, index) =>
      segment === segments[index] ||
      (/^\[[^\]]+\]$/.test(segment) && !!segments[index])
    )) return rule;
  }
  return null;
}

/** Unmapped dashboard routes fail closed. */
export function checkRule(
  rule: RoutePermissionRule | null,
  can: (permissionName: string) => boolean
): boolean {
  if (!rule) return false;
  const baseAllowed = (!rule.permission && !rule.anyOf?.length) ||
    (!!rule.permission && can(rule.permission)) || (rule.anyOf ?? []).some(can);
  return baseAllowed && (rule.allOf ?? []).every(can);
}

/** Login returns only to a known, authorized application page. */
export function permissionReturnTo(destination: string | null, can: (permission: string) => boolean): string {
  if (!destination?.startsWith("/") || destination.startsWith("//") || /[\\\u0000-\u001f]/.test(destination)) return "/dashboard";
  const url = new URL(destination, "https://churchos.invalid");
  return checkRule(matchRoutePermission(url.pathname), can)
    ? `${url.pathname}${url.search}${url.hash}`
    : "/dashboard";
}

/** Mirrors the server feature catalog; unknown/missing entitlements never grant a paid feature. */
export const FEATURE_MINIMUM_PLAN = {
  giving: 'essentials', events: 'community', groups: 'community', forms: 'community',
  reports: 'community', email: 'community', media: 'community',
  tickets: 'network', pastoral: 'network', assets: 'network', analytics: 'network',
  sms: 'network', whatsapp: 'network', calls: 'network', webhooks: 'network',
} as const;
export type PlanFeature = keyof typeof FEATURE_MINIMUM_PLAN;

export function featureForPath(path: string): PlanFeature | undefined {
  if (/^\/analytics(?:\/|$)/.test(path)) return 'analytics';
  if (/^\/assets(?:\/|$)/.test(path)) return 'assets';
  if (/^\/(?:pastoral|appointments)(?:\/|$)/.test(path)) return 'pastoral';
  if (/^\/forms(?:\/|$)/.test(path)) return 'forms';
  if (/^\/(?:departments|admin\/(?:departments|cell-groups))(?:\/|$)/.test(path)) return 'groups';
  if (/^\/reports(?:\/|$)/.test(path)) return 'reports';
  if (/^\/events\/(?:management|check-in|[^/]+\/tiers)(?:\/|$)/.test(path)) return 'tickets';
  if (/^\/events(?:\/|$)/.test(path)) return 'events';
  if (/^\/admin\/integrations(?:\/|$)/.test(path)) return 'giving';
  if (/^\/giving(?:\/|$)/.test(path)) return 'giving';
  if (/^\/(?:sermons|media)(?:\/|$)/.test(path)) return 'media';
  if (/^\/(?:communication\/(?:templates|broadcasts|messages))(?:\/|$)/.test(path)) return 'email';
  if (/^\/admin\/settings\/webhooks(?:\/|$)/.test(path)) return 'webhooks';
  return undefined;
}

export function featureForPermission(permission: string): PlanFeature | undefined {
  const [resource, surface] = permission.split(':');
  if (resource === 'events' && ['tickets', 'checkin'].includes(surface)) return 'tickets';
  if (['assets', 'asset_categories'].includes(resource)) return 'assets';
  if (['pastoral', 'pastoral_confidential', 'appointments'].includes(resource)) return 'pastoral';
  if (['departments', 'cell_groups'].includes(resource)) return 'groups';
  if (['sermons', 'media'].includes(resource)) return 'media';
  if (['templates', 'broadcasts', 'messages'].includes(resource)) return 'email';
  if (resource === 'integrations') return 'giving';
  if (resource === 'calls') return 'calls';
  if (resource === 'webhooks') return 'webhooks';
  if (['giving', 'events', 'forms', 'reports', 'analytics'].includes(resource)) return resource as PlanFeature;
  return undefined;
}

export function planAllowsPath(features: readonly string[] | undefined, path: string): boolean {
  const feature = featureForPath(path);
  return !feature || features?.includes(feature) === true;
}

export function planAllowsPermission(features: readonly string[] | undefined, permission: string): boolean {
  const feature = featureForPermission(permission);
  return !feature || features?.includes(feature) === true;
}
