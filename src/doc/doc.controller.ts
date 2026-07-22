/**
 * @file doc.controller.ts
 * @description HTTP endpoint that serves comprehensive API documentation.
 *
 * Dynamically discovers all registered routes in the NestJS application
 * and renders a beautiful, self-contained HTML documentation page at
 * `/api/v1/doc`. Each endpoint is listed with its HTTP method, path,
 * authentication requirements, role restrictions, description, and
 * request/response examples.
 *
 * @module doc/doc.controller
 * @since 1.0.0
 */

import { Controller, Get, Req, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';

// ─── Types ───────────────────────────────────────────────

interface RouteInfo {
  method: string;
  path: string;
  module: string;
  description: string;
  auth: 'Required' | 'Public' | 'Optional';
  roles: string[];
  permissions: string[];
}

interface ModuleGroup {
  module: string;
  description: string;
  basePath: string;
  routes: RouteInfo[];
}

// ─── Module Definitions ──────────────────────────────────
// These are hand-curated to provide accurate, developer-friendly documentation.
// Ordered from most commonly used to least.

const MODULE_DEFINITIONS: Record<string, { description: string }> = {
  Auth: {
    description:
      'Authentication and user session management via Supabase Auth. Handles registration, login, logout, password management, and session refresh. All auth endpoints are publicly accessible (except password change).',
  },
  Profiles: {
    description:
      'User profile management. Members and staff can view/update their own profiles. Administrators can list, view, and manage roles for all profiles in the church.',
  },
  Members: {
    description:
      'Core member management — CRUD operations, search, bulk import/export, QR code generation, giving and attendance history, and admin notes. All queries are scoped by church_id.',
  },
  Branches: {
    description:
      'Branch (campus/location) management. Each church can have multiple branches with one designated headquarters. Branches scope attendance, giving, events, and member data.',
  },
  Attendance: {
    description:
      'Attendance tracking with service scheduling, single and bulk check-in, visitor recording, and attendance analytics (summary, trends, by-service breakdown).',
  },
  Giving: {
    description:
      'Digital giving via Paystack and Flutterwave, cash/bank transfer recording, PDF receipt generation, giving categories, and recurring giving with automated Paystack charges.',
  },
  Events: {
    description:
      'Event management — CRUD, free and paid ticket registration with multi-tier pricing, event check-in via ticket code validation, and payment webhook integration.',
  },
  Sermons: {
    description:
      'Sermon archive with search, filtering by speaker/series/tag/date-range, audio URL management, and member bookmarking.',
  },
  WhatsApp: {
    description:
      'WhatsApp integration via 360dialog — inbound webhook processing, command routing (6 handlers: HELP, CHECKIN, GIVE, PRAYER, EVENTS, STATUS), outbound messaging, and template message sending.',
  },
  Communication: {
    description:
      'Multi-channel communication services — Resend email API and Termii SMS API with unified message logging and fallback tracking.',
  },
  Media: {
    description:
      'File upload services using Supabase Storage with sharp-based image optimization (WebP conversion, auto-resize). Media library browsing with folder, MIME type, and permission filtering.',
  },
  Templates: {
    description:
      'Message template management for WhatsApp, SMS, and email channels. Supports template variables, status workflow (draft/published/archived), and WhatsApp-specific fields (category, external_id, approval status).',
  },
  Broadcasts: {
    description:
      'Broadcast campaign management — create targeted message campaigns with audience filtering by status, branch, gender, and search. Messages dispatched via channel-specific BullMQ queues.',
  },
  Families: {
    description:
      'Family group management — CRUD operations, member-to-family linking with relationship types, head-of-family designation, and family search.',
  },
  Pastoral: {
    description:
      'Pastoral care — encrypted pastoral notes with AES-256-GCM and confidentiality tiers (standard/confidential/restricted), life event tracking, engagement and risk scoring for proactive pastoral attention.',
  },
  Admin: {
    description:
      'Church administration — department management with hierarchical structure and member assignments, cell group management with geolocation-based nearest-group recommendations, and dashboard analytics for pastors and administrators.',
  },
  Assets: {
    description:
      'Asset and inventory management — asset register with categories, maintenance scheduling, straight-line/reducing-balance depreciation, loan tracking, QR code generation, and scan workflow for field audits.',
  },
  Forms: {
    description:
      'Form builder and submission management — create forms with custom field definitions (text, number, date, dropdown, etc.), clone templates, collect public anonymous submissions, and manage approval workflows.',
  },
  Analytics: {
    description:
      'Cross-domain analytics and reporting — unified dashboard, giving analytics (trends, categories, top donors), attendance analytics (by service/branch, visitor analysis), member demographics, event analytics, and communication channel stats. Responses are cached for performance (3–10 min TTL).',
  },
  Reports: {
    description:
      'Report generation — financial reports (giving totals, trends, category breakdown), attendance reports (by service with averages), and member reports (demographics, growth, activity summary). Supports CSV export. Responses are cached for performance (5–10 min TTL).',
  },
  Church: {
    description:
      'Church profile and configuration management — update church details, manage church configuration settings, and staff invitation/management (invite, list, update roles, remove staff).',
  },
  Visitors: {
    description:
      'Visitor management — track first-time visitors, manage follow-up workflows (new/contacted/follow-up scheduled/interested/converted/dropped-off), and assign follow-up team members.',
  },
  'Custom Fields': {
    description:
      'Custom field definitions for member profiles — create church-specific custom fields with types: text, number, date, dropdown, checkbox, textarea. Field values are stored in the member model as JSON.',
  },
  Users: {
    description:
      'User account management — invite new users, deactivate accounts, and manage user lifecycle. Integrates with Supabase Auth for identity management.',
  },
  Notifications: {
    description:
      'In-app notification system — create, list, and mark notifications as read. Supports notification types: system, attendance, giving, event, pastoral, and broadcast.',
  },
  Sync: {
    description:
      'Offline data synchronization — push/pull changes between mobile clients and server with conflict resolution based on timestamps and last-writer-wins strategy.',
  },
  Webhooks: {
    description:
      'Outbound webhook management — subscribe to events (member.created, transaction.completed, etc.), manage delivery logs, and handle retry logic with exponential backoff.',
  },
  Permissions: {
    description:
      'Role-based permission management — configure church-specific permission overrides for roles. Extends the default role-permission matrix with church-level customizations.',
  },
  Health: {
    description:
      'Health check endpoint for monitoring infrastructure. Checks database connectivity, Redis availability, and per-queue metrics (active, waiting, completed, failed, delayed job counts) for all BullMQ queues.',
  },
};

@ApiTags('Documentation')
@Controller('doc')
export class DocController {
  private readonly logger = new Logger(DocController.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  @Get()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Get full API documentation page' })
  getDocs(@Req() req: Request): string {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/v1`;
    const swaggerUrl = `${baseUrl}/docs`;

    // Discover routes from the Express router
    const routeGroups = this.discoverRoutes(baseUrl);

    const modulesHtml = routeGroups
      .map((group) => this.renderModuleGroup(group, baseUrl))
      .join('\n');

    const routeCount = routeGroups.reduce((sum, g) => sum + g.routes.length, 0);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChurchOS API Documentation</title>
  <style>
    /* ─── Reset & Base ────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }

    /* ─── Layout ──────────────────────────────────────────── */
    .sidebar {
      position: fixed; top: 0; left: 0; width: 280px; height: 100vh;
      background: #1e293b; border-right: 1px solid #334155;
      overflow-y: auto; z-index: 100; padding-bottom: 2rem;
    }
    .sidebar::-webkit-scrollbar { width: 6px; }
    .sidebar::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
    .main { margin-left: 280px; min-height: 100vh; }

    /* ─── Sidebar Header ──────────────────────────────────── */
    .sidebar-header {
      padding: 1.5rem 1.25rem; border-bottom: 1px solid #334155;
      background: linear-gradient(135deg, #1e293b 0%, #1a2332 100%);
    }
    .sidebar-header h1 { font-size: 1.125rem; font-weight: 700; color: #f8fafc; }
    .sidebar-header .subtitle { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .sidebar-header .version { font-size: 0.75rem; color: #6366f1; margin-top: 0.125rem; }
    .sidebar-header .route-count {
      display: inline-block; margin-top: 0.5rem;
      background: #6366f1; color: #fff; padding: 0.125rem 0.5rem;
      border-radius: 9999px; font-size: 0.6875rem; font-weight: 600;
    }
    .sidebar-header .go-swagger {
      display: inline-block; margin-top: 0.5rem; margin-left: 0.5rem;
      background: transparent; color: #6366f1; padding: 0.125rem 0.5rem;
      border-radius: 9999px; font-size: 0.6875rem; font-weight: 600;
      border: 1px solid #6366f1; text-decoration: none;
    }

    /* ─── Sidebar Nav ─────────────────────────────────────── */
    .sidebar-nav { padding: 0.75rem 0; }
    .sidebar-nav a {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 1.25rem; color: #94a3b8; text-decoration: none;
      font-size: 0.8125rem; transition: all 0.15s ease;
    }
    .sidebar-nav a:hover { color: #e2e8f0; background: rgba(99,102,241,0.08); }
    .sidebar-nav a .count {
      margin-left: auto; font-size: 0.6875rem; color: #64748b;
      background: #1e293b; padding: 0.0625rem 0.375rem; border-radius: 4px;
    }
    .sidebar-nav .nav-category {
      padding: 0.75rem 1.25rem 0.25rem; font-size: 0.6875rem;
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
      color: #475569;
    }

    /* ─── Main Content ────────────────────────────────────── */
    .hero {
      padding: 3rem 3rem 2rem;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-bottom: 1px solid #1e293b;
    }
    .hero h1 { font-size: 2rem; font-weight: 800; color: #f8fafc; }
    .hero p { margin-top: 0.75rem; color: #94a3b8; max-width: 720px; font-size: 0.9375rem; }
    .hero .meta { margin-top: 1rem; display: flex; gap: 1.5rem; font-size: 0.8125rem; color: #64748b; }
    .hero .meta strong { color: #94a3b8; }

    .module-section { padding: 2rem 3rem; border-bottom: 1px solid #1e293b; }
    .module-section:target { scroll-margin-top: 1rem; }

    .module-header {
      display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;
    }
    .module-header h2 {
      font-size: 1.25rem; font-weight: 700; color: #f8fafc;
    }
    .module-header .badge {
      font-size: 0.6875rem; color: #6366f1; background: rgba(99,102,241,0.12);
      padding: 0.125rem 0.5rem; border-radius: 9999px; font-weight: 600;
    }
    .module-description { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    .module-base {
      font-size: 0.75rem; color: #475569; font-family: 'JetBrains Mono', monospace;
      margin-bottom: 1rem; padding: 0.25rem 0.75rem; background: #1e293b;
      border-radius: 6px; display: inline-block;
    }

    /* ─── Route Card ──────────────────────────────────────── */
    .route-card {
      background: #1e293b; border: 1px solid #334155; border-radius: 8px;
      margin-bottom: 0.75rem; overflow: hidden;
      transition: border-color 0.15s ease;
    }
    .route-card:hover { border-color: #475569; }

    .route-header {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem 1rem; cursor: pointer;
    }
    .route-header:hover { background: rgba(99,102,241,0.04); }

    .method-badge {
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.625rem; font-weight: 700; padding: 0.1875rem 0.5rem;
      border-radius: 4px; text-transform: uppercase; min-width: 48px;
      letter-spacing: 0.05em; font-family: 'JetBrains Mono', monospace;
    }
    .method-GET { background: rgba(16,185,129,0.15); color: #34d399; }
    .method-POST { background: rgba(99,102,241,0.15); color: #818cf8; }
    .method-PATCH { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .method-PUT { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .method-DELETE { background: rgba(239,68,68,0.15); color: #f87171; }

    .route-path {
      font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;
      color: #cbd5e1; flex: 1;
    }
    .route-desc {
      font-size: 0.8125rem; color: #94a3b8; flex: 1; text-align: right;
    }
    .route-badges { display: flex; gap: 0.375rem; }
    .route-badge {
      font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 4px;
      font-weight: 600;
    }
    .route-badge.auth { background: rgba(16,185,129,0.12); color: #34d399; }
    .route-badge.public { background: rgba(99,102,241,0.12); color: #818cf8; }
    .route-badge.role { background: rgba(245,158,11,0.12); color: #fbbf24; }

    .route-details {
      display: none; padding: 0 1rem 1rem;
      border-top: 1px solid #334155; margin-top: 0;
    }
    .route-card.open .route-details { display: block; }

    .detail-row {
      margin-top: 0.75rem; font-size: 0.8125rem;
    }
    .detail-row strong {
      display: block; font-size: 0.6875rem; text-transform: uppercase;
      letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.25rem;
    }
    .detail-row .value { color: #94a3b8; }
    .detail-row .role-pill {
      display: inline-block; font-size: 0.6875rem; background: #334155;
      color: #94a3b8; padding: 0.125rem 0.5rem; border-radius: 4px;
      margin: 0.125rem 0.125rem 0 0;
    }

    code {
      font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
      background: #334155; padding: 0.125rem 0.375rem; border-radius: 4px;
      color: #e2e8f0;
    }
    .endpoint-example {
      background: #0f172a; border: 1px solid #334155; border-radius: 6px;
      padding: 0.75rem; margin-top: 0.5rem; overflow-x: auto;
    }
    .endpoint-example code {
      background: transparent; padding: 0; font-size: 0.75rem;
      line-height: 1.7; color: #a5b4fc;
    }

    /* ─── Footer ──────────────────────────────────────────── */
    .footer {
      padding: 2rem 3rem; text-align: center; color: #475569; font-size: 0.75rem;
    }
    .footer a { color: #6366f1; text-decoration: none; }

    /* ─── Responsive ──────────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; }
      .hero, .module-section { padding: 1.5rem; }
      .route-header { flex-wrap: wrap; }
      .route-desc { width: 100%; text-align: left; margin-top: 0.25rem; }
    }
  </style>
</head>
<body>

<!-- ─── Sidebar ────────────────────────────────────────── -->
<aside class="sidebar">
  <div class="sidebar-header">
    <h1>ChurchOS API</h1>
    <div class="subtitle">Backend API Documentation</div>
    <div class="version">v1.0 • <span class="route-count">${routeCount} endpoints</span>
      <a href="${swaggerUrl}" target="_blank" class="go-swagger">Swagger UI →</a>
    </div>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-category">Modules</div>
    ${routeGroups
      .map(
        (g) =>
          `<a href="#module-${this.slugify(g.module)}">${g.module} <span class="count">${g.routes.length}</span></a>`,
      )
      .join('\n')}
  </nav>
</aside>

<!-- ─── Main Content ───────────────────────────────────── -->
<div class="main">
  <div class="hero">
    <h1>📖 ChurchOS API Reference</h1>
    <p>
      Complete API documentation for the ChurchOS Church Management Platform.
      This documentation covers all ${routeCount} endpoints across ${routeGroups.length} modules.
      All endpoints are prefixed with <code>/api/v1</code>.
    </p>
    <div class="meta">
      <span><strong>Base URL:</strong> <code>${baseUrl}</code></span>
      <span><strong>Auth:</strong> Bearer JWT (Supabase Auth)</span>
    </div>
  </div>

  ${modulesHtml}

  <div class="footer">
    ChurchOS — Church Management &amp; Digital Ministry Platform •
    <a href="${swaggerUrl}" target="_blank">Interactive Swagger Docs</a> •
    Built with NestJS
  </div>
</div>

<script>
  // Toggle route details on click
  document.querySelectorAll('.route-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.route-card');
      // Close others
      // document.querySelectorAll('.route-card.open').forEach(c => { if (c !== card) c.classList.remove('open'); });
      card.classList.toggle('open');
    });
  });
</script>

</body>
</html>`;
  }

  // ─── Route Discovery ────────────────────────────────────

  /**
   * Discovers all registered routes from the Express router and groups them
   * by module (based on the first path segment).
   */
  private discoverRoutes(baseUrl: string): ModuleGroup[] {
    const discovered = new Map<string, RouteInfo[]>();

    try {
      const adapter = this.httpAdapterHost?.httpAdapter;
      if (!adapter) {
        return this.getFallbackRoutes(baseUrl);
      }

      // Access the underlying Express instance
      const instance = adapter.getInstance();
      if (!instance?._router?.stack) {
        return this.getFallbackRoutes(baseUrl);
      }

      const expressRouter = instance._router as ExpressRouter;
      const apiPrefix = '/api/v1';

      for (const layer of expressRouter.stack) {
        if (!layer?.route) continue;

        const route = layer.route;
        const fullPath = route.path;
        const methods = Object.keys(route.methods).map((m) => m.toUpperCase());

        // Only include API routes
        if (!fullPath.startsWith(apiPrefix)) continue;

        const pathWithoutPrefix = fullPath.replace(apiPrefix, '') || '/';
        const moduleName = this.guessModuleFromPath(pathWithoutPrefix);

        for (const method of methods) {
          if (!discovered.has(moduleName)) {
            discovered.set(moduleName, []);
          }
          discovered.get(moduleName)!.push({
            method,
            path: pathWithoutPrefix,
            module: moduleName,
            description: this.guessDescription(method, pathWithoutPrefix, moduleName),
            auth: moduleName === 'Health' || moduleName === 'Auth' ? 'Public' : 'Required',
            roles: this.guessRoles(moduleName, method, pathWithoutPrefix),
            permissions: [],
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Route discovery failed, using fallback: ${(err as Error).message}`);
      return this.getFallbackRoutes(baseUrl);
    }

    if (discovered.size === 0) {
      return this.getFallbackRoutes(baseUrl);
    }

    // Convert to array and sort by module order
    return this.sortModules(
      Array.from(discovered.entries()).map(([module, routes]) => ({
        module,
        description: MODULE_DEFINITIONS[module]?.description || '',
        basePath: this.getBasePath(module),
        routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
      })),
    );
  }

  /**
   * Returns the comprehensive fallback route data when runtime discovery fails.
   * This is a hand-curated list of all API endpoints organized by module.
   */
  private getFallbackRoutes(_baseUrl: string): ModuleGroup[] {
    return this.getAllModuleGroups();
  }

  // ─── Fallback Module Groups ─────────────────────────────
  // Hand-curated comprehensive list of all API endpoints.

  private getAllModuleGroups(): ModuleGroup[] {
    return [
      {
        module: 'Auth',
        description: MODULE_DEFINITIONS['Auth']?.description || '',
        basePath: '/auth',
        routes: [
          {
            method: 'POST',
            path: '/auth/register',
            module: 'Auth',
            description:
              'Register a new user account with Supabase Auth and create a church/profile',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/auth/login',
            module: 'Auth',
            description: 'Authenticate user and return JWT session tokens',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/auth/logout',
            module: 'Auth',
            description: 'Invalidate current session and blacklist token in Redis',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/auth/forgot-password',
            module: 'Auth',
            description: 'Request a password reset email via Supabase',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/auth/reset-password',
            module: 'Auth',
            description: 'Reset password using recovery token from email',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'PUT',
            path: '/auth/password',
            module: 'Auth',
            description: 'Change password for an authenticated user',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/auth/refresh',
            module: 'Auth',
            description: 'Refresh an expired session token',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Profiles',
        description: MODULE_DEFINITIONS['Profiles']?.description || '',
        basePath: '/profiles',
        routes: [
          {
            method: 'GET',
            path: '/profiles/me',
            module: 'Profiles',
            description: "Get the authenticated user's profile with church and branch details",
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/profiles/me',
            module: 'Profiles',
            description: "Update the authenticated user's profile (first name, last name, phone)",
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/profiles/me/photo',
            module: 'Profiles',
            description: 'Upload profile photo (auto-optimized via sharp/WebP)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/profiles',
            module: 'Profiles',
            description:
              'List all profiles in the church with pagination, search, role/branch filters',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/profiles/:profileId',
            module: 'Profiles',
            description: 'Get a specific profile by ID (same-church access only)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/profiles/:profileId/role',
            module: 'Profiles',
            description:
              "Update a profile's role. Prevents self-demotion and super_admin modification",
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: ['profiles:update'],
          },
          {
            method: 'DELETE',
            path: '/profiles/:profileId',
            module: 'Profiles',
            description: 'Soft-delete a profile. Prevents self-deactivation',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['profiles:delete'],
          },
        ],
      },
      {
        module: 'Members',
        description: MODULE_DEFINITIONS['Members']?.description || '',
        basePath: '/members',
        routes: [
          {
            method: 'POST',
            path: '/members',
            module: 'Members',
            description: 'Create a new member. Checks for duplicate phone within church',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: ['members:create'],
          },
          {
            method: 'GET',
            path: '/members',
            module: 'Members',
            description:
              'List members with pagination, search (name/email/phone), status/branch filters, sorting',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/members/search',
            module: 'Members',
            description: 'Full-text search across member names, emails, and phone numbers',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/members/export/csv',
            module: 'Members',
            description: 'Export members as CSV with field-level permission filtering',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: ['members:read'],
          },
          {
            method: 'GET',
            path: '/members/export/xlsx',
            module: 'Members',
            description:
              'Export members as XLSX with styled headers, auto-filter, and frozen header row',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: ['members:read'],
          },
          {
            method: 'POST',
            path: '/members/bulk-import',
            module: 'Members',
            description:
              'Bulk import members from CSV/JSON with dry-run validation and duplicate detection',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: ['members:create'],
          },
          {
            method: 'GET',
            path: '/members/:id',
            module: 'Members',
            description: 'Get a single member by ID with church scoping',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/members/:id',
            module: 'Members',
            description: 'Update a member (partial update). Checks for duplicate phone',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: ['members:update'],
          },
          {
            method: 'DELETE',
            path: '/members/:id',
            module: 'Members',
            description: 'Soft-delete a member (sets status to inactive)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['members:delete'],
          },
          {
            method: 'POST',
            path: '/members/:id/restore',
            module: 'Members',
            description: 'Restore a soft-deleted member (sets status back to active)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['members:update'],
          },
          {
            method: 'GET',
            path: '/members/:id/giving',
            module: 'Members',
            description: 'Get giving history for a member',
            auth: 'Required',
            roles: ['church_admin', 'treasurer', 'secretary'],
            permissions: ['members:read'],
          },
          {
            method: 'GET',
            path: '/members/:id/attendance',
            module: 'Members',
            description: 'Get attendance history for a member',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/members/:id/qr-code',
            module: 'Members',
            description: 'Generate QR code data for a member (CHURCHOS:MEMBER:<id> format)',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: ['members:read'],
          },
          {
            method: 'POST',
            path: '/members/:id/notes',
            module: 'Members',
            description: 'Add an admin note with timestamp to a member',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: ['members:update'],
          },
        ],
      },
      {
        module: 'Branches',
        description: MODULE_DEFINITIONS['Branches']?.description || '',
        basePath: '/branches',
        routes: [
          {
            method: 'POST',
            path: '/branches',
            module: 'Branches',
            description: 'Create a new branch. Only one headquarters per church allowed',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['branches:create'],
          },
          {
            method: 'GET',
            path: '/branches',
            module: 'Branches',
            description: 'List all branches for the church (headquarters first)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/branches/:id',
            module: 'Branches',
            description: 'Get a single branch by ID with church scoping',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/branches/:id',
            module: 'Branches',
            description: 'Update branch details',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['branches:update'],
          },
          {
            method: 'DELETE',
            path: '/branches/:id',
            module: 'Branches',
            description: 'Delete a branch. Blocked if members are assigned',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['branches:delete'],
          },
        ],
      },
      {
        module: 'Attendance',
        description: MODULE_DEFINITIONS['Attendance']?.description || '',
        basePath: '/',
        routes: [
          {
            method: 'POST',
            path: '/services',
            module: 'Attendance',
            description: 'Create a new service (e.g., Sunday Service, Wednesday Bible Study)',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/services',
            module: 'Attendance',
            description: 'List all services with active filter',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/services/:id',
            module: 'Attendance',
            description: 'Get service details by ID',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/services/:id',
            module: 'Attendance',
            description: 'Update service details',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/attendance',
            module: 'Attendance',
            description: 'Record single attendance check-in. Prevents duplicates per service',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'usher', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/attendance/bulk',
            module: 'Attendance',
            description: 'Record bulk attendance check-ins',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'usher', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/attendance/summary',
            module: 'Attendance',
            description: 'Get attendance summary statistics',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/attendance/trends',
            module: 'Attendance',
            description: 'Get attendance trend data over time',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/attendance/by-service/:id',
            module: 'Attendance',
            description: 'Get attendance records for a specific service',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/attendance/visitor',
            module: 'Attendance',
            description: 'Record attendance for a visitor (non-member)',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'usher', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Giving',
        description: MODULE_DEFINITIONS['Giving']?.description || '',
        basePath: '/giving',
        routes: [
          {
            method: 'POST',
            path: '/giving/categories',
            module: 'Giving',
            description: 'Create a giving category (e.g., Tithe, Offering, Building Project)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['giving:create'],
          },
          {
            method: 'GET',
            path: '/giving/categories',
            module: 'Giving',
            description: 'List giving categories with active filter',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/giving/categories/:categoryId',
            module: 'Giving',
            description: 'Get a giving category by ID',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/giving/categories/:categoryId',
            module: 'Giving',
            description: 'Update a giving category',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['giving:update'],
          },
          {
            method: 'DELETE',
            path: '/giving/categories/:categoryId',
            module: 'Giving',
            description: 'Deactivate a giving category (soft-delete)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['giving:delete'],
          },
          {
            method: 'POST',
            path: '/giving/initialize',
            module: 'Giving',
            description: 'Initialize a digital payment via Paystack or Flutterwave',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/giving/verify/:reference',
            module: 'Giving',
            description: 'Verify a payment by reference number via the gateway',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/giving/webhook/paystack',
            module: 'Giving',
            description: 'Paystack webhook handler (HMAC-SHA512 signature validation)',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/giving/webhook/flutterwave',
            module: 'Giving',
            description: 'Flutterwave webhook handler (HMAC-SHA512 signature validation)',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/giving/cash',
            module: 'Giving',
            description: 'Record a cash or bank transfer giving manually',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'treasurer'],
            permissions: ['giving:create'],
          },
          {
            method: 'GET',
            path: '/giving/transactions',
            module: 'Giving',
            description: 'List transactions with pagination, filters, and sorting',
            auth: 'Required',
            roles: ['church_admin', 'treasurer', 'secretary'],
            permissions: ['giving:read'],
          },
          {
            method: 'GET',
            path: '/giving/transactions/:transactionId',
            module: 'Giving',
            description: 'Get transaction details by ID',
            auth: 'Required',
            roles: ['church_admin', 'treasurer', 'secretary'],
            permissions: ['giving:read'],
          },
          {
            method: 'GET',
            path: '/giving/transactions/:transactionId/receipt',
            module: 'Giving',
            description: 'Download PDF receipt for a transaction',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/giving/recurring',
            module: 'Giving',
            description: 'Create a recurring giving plan (weekly/monthly/quarterly)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/giving/recurring',
            module: 'Giving',
            description: 'List recurring giving plans for the authenticated member',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/giving/recurring/:id/cancel',
            module: 'Giving',
            description: 'Cancel a recurring giving plan',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Events',
        description: MODULE_DEFINITIONS['Events']?.description || '',
        basePath: '/events',
        routes: [
          {
            method: 'POST',
            path: '/events',
            module: 'Events',
            description: 'Create a new event (free or paid with ticket tiers)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: ['events:create'],
          },
          {
            method: 'GET',
            path: '/events',
            module: 'Events',
            description: 'List events with filters (type, date range) and pagination',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/events/:eventId',
            module: 'Events',
            description: 'Get event details with registrations and ticket tiers',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/events/:eventId',
            module: 'Events',
            description: 'Update event details (title, description, dates, capacity, etc.)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: ['events:update'],
          },
          {
            method: 'DELETE',
            path: '/events/:eventId',
            module: 'Events',
            description: 'Delete an event',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: ['events:delete'],
          },
          {
            method: 'POST',
            path: '/events/:eventId/register',
            module: 'Events',
            description:
              'Register a member for an event (free or initiates payment for paid events)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/events/:eventId/register/:memberId',
            module: 'Events',
            description: "Cancel a member's event registration",
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: ['events:update'],
          },
          {
            method: 'POST',
            path: '/events/:eventId/webhook/paystack',
            module: 'Events',
            description: 'Paystack webhook for event ticket payments',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/events/:eventId/tiers',
            module: 'Events',
            description: 'Create a ticket tier for a paid event',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: ['events:update'],
          },
          {
            method: 'POST',
            path: '/events/:eventId/tickets/validate',
            module: 'Events',
            description: 'Validate a ticket code for event check-in',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'usher', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Sermons',
        description: MODULE_DEFINITIONS['Sermons']?.description || '',
        basePath: '/sermons',
        routes: [
          {
            method: 'POST',
            path: '/sermons',
            module: 'Sermons',
            description: 'Create a new sermon record',
            auth: 'Required',
            roles: ['church_admin', 'branch_pastor'],
            permissions: ['sermons:create'],
          },
          {
            method: 'GET',
            path: '/sermons',
            module: 'Sermons',
            description:
              'List sermons with search, speaker/series/tag/date-range filters, and pagination',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/sermons/bookmarks/me',
            module: 'Sermons',
            description: "List the authenticated member's bookmarked sermons",
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/sermons/:sermonId',
            module: 'Sermons',
            description: 'Get a single sermon by ID',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/sermons/:sermonId/bookmark',
            module: 'Sermons',
            description: 'Bookmark a sermon for the authenticated member',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/sermons/:sermonId/bookmark',
            module: 'Sermons',
            description: 'Check if the authenticated member has bookmarked a sermon',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/sermons/:sermonId/bookmark',
            module: 'Sermons',
            description: 'Remove a bookmark from a sermon',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/sermons/:sermonId',
            module: 'Sermons',
            description: 'Update sermon details (title, speaker, date, audio URL, etc.)',
            auth: 'Required',
            roles: ['church_admin', 'branch_pastor'],
            permissions: ['sermons:update'],
          },
          {
            method: 'DELETE',
            path: '/sermons/:sermonId',
            module: 'Sermons',
            description: 'Delete a sermon',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['sermons:delete'],
          },
        ],
      },
      {
        module: 'Church',
        description: MODULE_DEFINITIONS['Church']?.description || '',
        basePath: '/church',
        routes: [
          {
            method: 'GET',
            path: '/church',
            module: 'Church',
            description: 'Get the current church details',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/church',
            module: 'Church',
            description: 'Update church details (name, denomination, address, phone, email, etc.)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['church:update'],
          },
          {
            method: 'GET',
            path: '/church/config',
            module: 'Church',
            description: 'Get church configuration settings',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/church/config',
            module: 'Church',
            description: 'Update church configuration settings',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['church:update'],
          },
          {
            method: 'POST',
            path: '/church/invite',
            module: 'Church',
            description: 'Invite a staff member via email (creates Supabase user + profile)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['church:update'],
          },
          {
            method: 'GET',
            path: '/church/staff',
            module: 'Church',
            description: 'List all staff members with profiles and roles',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/church/staff/:profileId/role',
            module: 'Church',
            description: "Update a staff member's role",
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['church:update'],
          },
          {
            method: 'DELETE',
            path: '/church/staff/:profileId',
            module: 'Church',
            description: 'Remove a staff member (soft-delete profile)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: ['church:update'],
          },
        ],
      },
      {
        module: 'WhatsApp',
        description: MODULE_DEFINITIONS['WhatsApp']?.description || '',
        basePath: '/whatsapp',
        routes: [
          {
            method: 'GET',
            path: '/whatsapp/webhook',
            module: 'WhatsApp',
            description: '360dialog webhook verification (challenge-response)',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/whatsapp/webhook',
            module: 'WhatsApp',
            description: '360dialog inbound message and status webhook handler',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/whatsapp/send',
            module: 'WhatsApp',
            description: 'Send an outbound WhatsApp message',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/whatsapp/send-template',
            module: 'WhatsApp',
            description: 'Send a WhatsApp template message',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/whatsapp/messages',
            module: 'WhatsApp',
            description: 'List WhatsApp messages with pagination and channel filter',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Media',
        description: MODULE_DEFINITIONS['Media']?.description || '',
        basePath: '/media',
        routes: [
          {
            method: 'POST',
            path: '/media/upload',
            module: 'Media',
            description:
              'Upload a file (image/file) to Supabase Storage with optional optimization',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/media/library',
            module: 'Media',
            description: 'List media assets with folder, MIME type, and permission filters',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/media/library/folders',
            module: 'Media',
            description: 'List distinct folders in the media library',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/media/library/:assetId',
            module: 'Media',
            description: 'Get media asset details by ID',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/media/library/:assetId/permissions',
            module: 'Media',
            description: 'Update media asset permissions (public/members/leadership)',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/media/library/:assetId',
            module: 'Media',
            description: 'Delete a media asset from storage and database',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Admin',
        description: MODULE_DEFINITIONS['Admin']?.description || '',
        basePath: '/admin',
        routes: [
          {
            method: 'POST',
            path: '/admin/departments',
            module: 'Admin',
            description: 'Create a new department with optional parent hierarchy',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/departments',
            module: 'Admin',
            description: 'List all departments with member counts',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/departments/:departmentId',
            module: 'Admin',
            description: 'Get department details with members',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/admin/departments/:departmentId',
            module: 'Admin',
            description: 'Update department details',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/admin/departments/:departmentId',
            module: 'Admin',
            description: 'Delete a department (blocked if members are assigned)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/admin/departments/:departmentId/members',
            module: 'Admin',
            description: 'Add a member to a department',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/admin/departments/:departmentId/members/:memberId',
            module: 'Admin',
            description: 'Remove a member from a department',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/admin/cell-groups',
            module: 'Admin',
            description: 'Create a new cell group with geolocation',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups',
            module: 'Admin',
            description: 'List all cell groups',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups/nearest',
            module: 'Admin',
            description: 'Find nearest cell groups by geolocation (Haversine formula)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor', 'member'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups/:groupId',
            module: 'Admin',
            description: 'Get cell group details',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/admin/cell-groups/:groupId',
            module: 'Admin',
            description: 'Update cell group details',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/admin/cell-groups/:groupId',
            module: 'Admin',
            description: 'Delete a cell group',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/admin/cell-groups/:groupId/members',
            module: 'Admin',
            description: 'Add a member to a cell group',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/admin/cell-groups/:groupId/members/:memberId',
            module: 'Admin',
            description: 'Remove a member from a cell group',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups/:groupId/members',
            module: 'Admin',
            description: 'List members of a cell group',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/admin/cell-groups/:groupId/attendance',
            module: 'Admin',
            description: 'Record cell group meeting attendance',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor', 'cell_leader'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups/:groupId/attendance',
            module: 'Admin',
            description: 'List attendance records for a cell group',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/cell-groups/:groupId/attendance/summary',
            module: 'Admin',
            description:
              'Get attendance summary for a cell group (total meetings, average, member count)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/dashboard/attention',
            module: 'Admin',
            description: 'Get list of members needing attention (high/critical risk scores)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/dashboard/engagement',
            module: 'Admin',
            description: 'Get engagement score distribution (highly/moderately/low/disengaged)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/dashboard/rising-stars',
            module: 'Admin',
            description: 'Get top engaging members (rising stars)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/admin/dashboard/recalculate-scores',
            module: 'Admin',
            description: 'Manually trigger engagement and risk score recalculation',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/dashboard/follow-up',
            module: 'Admin',
            description: 'Get batch follow-up suggestions for all at-risk members',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/dashboard/follow-up/:memberId',
            module: 'Admin',
            description: 'Get follow-up suggestions for a specific at-risk member',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/admin/churches',
            module: 'Admin',
            description: 'List all churches (super_admin only) with member/branch/giving summaries',
            auth: 'Required',
            roles: ['super_admin'],
            permissions: ['admin:list_churches'],
          },
          {
            method: 'GET',
            path: '/admin/churches/analytics',
            module: 'Admin',
            description: 'Get cross-church analytics (super_admin only) with aggregated metrics',
            auth: 'Required',
            roles: ['super_admin'],
            permissions: ['admin:list_churches'],
          },
        ],
      },
      {
        module: 'Pastoral',
        description: MODULE_DEFINITIONS['Pastoral']?.description || '',
        basePath: '/pastoral',
        routes: [
          {
            method: 'POST',
            path: '/pastoral/notes',
            module: 'Pastoral',
            description:
              'Create a pastoral note (AES-256-GCM encrypted, with confidentiality level)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/pastoral/notes',
            module: 'Pastoral',
            description: 'List pastoral notes with member filter and confidentiality scoping',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/pastoral/notes/:noteId',
            module: 'Pastoral',
            description: 'Get a single pastoral note by ID (decrypted for authorized users)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/pastoral/notes/:noteId',
            module: 'Pastoral',
            description: 'Update a pastoral note (re-encrypts with updated content)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/pastoral/notes/:noteId',
            module: 'Pastoral',
            description: 'Delete a pastoral note. Restricted notes require dual authorization',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/pastoral/life-events',
            module: 'Pastoral',
            description: 'Create a life event record (birthday, wedding, anniversary, etc.)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/pastoral/life-events',
            module: 'Pastoral',
            description: 'List life events with member filter and type/date range filters',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/pastoral/life-events/upcoming',
            module: 'Pastoral',
            description: 'Get upcoming life events for automated greeting workflows (N days ahead)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/pastoral/life-events/:eventId',
            module: 'Pastoral',
            description: 'Get a single life event by ID',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/pastoral/life-events/:eventId',
            module: 'Pastoral',
            description: 'Delete a life event record',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Assets',
        description: MODULE_DEFINITIONS['Assets']?.description || '',
        basePath: '/assets',
        routes: [
          {
            method: 'POST',
            path: '/assets/categories',
            module: 'Assets',
            description: 'Create an asset category',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/assets/categories',
            module: 'Assets',
            description: 'List asset categories',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/assets/categories/:id',
            module: 'Assets',
            description: 'Update an asset category',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/assets/categories/:id',
            module: 'Assets',
            description: 'Delete an asset category (blocked if assets are assigned)',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/assets',
            module: 'Assets',
            description:
              'Register a new asset with tag, category, purchase details, and depreciation config',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/assets',
            module: 'Assets',
            description:
              'List assets with search, category/status/branch/department filters, and sorting',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/assets/:id',
            module: 'Assets',
            description: 'Get asset details with maintenance, depreciation, and loan history',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/assets/:id',
            module: 'Assets',
            description: 'Update asset details',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/assets/:id',
            module: 'Assets',
            description: 'Delete an asset',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/assets/:id/qr-code',
            module: 'Assets',
            description: 'Generate QR code data for an asset (CHURCHOS:ASSET:<id>)',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/assets/:id/maintenance',
            module: 'Assets',
            description: 'Schedule or record maintenance for an asset',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/assets/:id/maintenance/:maintenanceId',
            module: 'Assets',
            description: 'Update maintenance record (mark as completed, update cost, etc.)',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/assets/:id/maintenance/:maintenanceId',
            module: 'Assets',
            description: 'Delete a maintenance record',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/assets/:id/loans',
            module: 'Assets',
            description: 'Loan out an asset to a member or external party',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/assets/:id/loans/:loanId/return',
            module: 'Assets',
            description: 'Mark a loaned asset as returned with condition assessment',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/assets/:id/depreciation',
            module: 'Assets',
            description:
              'Calculate and record annual depreciation (straight-line or reducing-balance)',
            auth: 'Required',
            roles: ['church_admin', 'treasurer'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/assets/:id/scan',
            module: 'Assets',
            description: 'Record an asset scan (check, loan, return, maintenance)',
            auth: 'Required',
            roles: ['church_admin', 'treasurer', 'usher'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Forms',
        description: MODULE_DEFINITIONS['Forms']?.description || '',
        basePath: '/forms',
        routes: [
          {
            method: 'POST',
            path: '/forms',
            module: 'Forms',
            description: 'Create a new form with field definitions',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/forms',
            module: 'Forms',
            description: 'List forms with status/template filters and pagination',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/forms/:formId',
            module: 'Forms',
            description: 'Get form details with field definitions',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/forms/:formId',
            module: 'Forms',
            description: 'Update a form (title, description, fields, status)',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/forms/:formId',
            module: 'Forms',
            description: 'Delete a form',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/forms/:formId/clone',
            module: 'Forms',
            description: 'Clone a form as a new template',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/forms/:formId/submit',
            module: 'Forms',
            description: 'Submit a form response (authenticated)',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/forms/:formId/submissions',
            module: 'Forms',
            description: 'List submissions for a form',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/forms/:formId/submissions/:submissionId',
            module: 'Forms',
            description: 'Get a single submission with form data',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/forms/:formId/submissions/:submissionId/status',
            module: 'Forms',
            description: 'Update submission status (approve/reject) with optional rejection reason',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/forms/public/:publicToken/submit',
            module: 'Forms',
            description: 'Submit a public form anonymously (no auth required)',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Analytics',
        description: MODULE_DEFINITIONS['Analytics']?.description || '',
        basePath: '/analytics',
        routes: [
          {
            method: 'GET',
            path: '/analytics/dashboard',
            module: 'Analytics',
            description:
              'Unified dashboard overview — members, attendance, giving, risk, events, forms, engagement. Cached (3 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/analytics/giving',
            module: 'Analytics',
            description:
              'Giving analytics — totals, trends, category/branch/type breakdown, top donors, recurring. Cached (5 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor', 'treasurer'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/analytics/attendance',
            module: 'Analytics',
            description:
              'Attendance analytics — check-ins, sources, branch/service breakdown, visitor analysis, trends. Cached (3 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/analytics/members',
            module: 'Analytics',
            description:
              'Member demographics — status, gender, age groups, monthly growth. Cached (10 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/analytics/events',
            module: 'Analytics',
            description:
              'Event analytics — summary, registrations, capacity, revenue, tier breakdown. Cached (3 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/analytics/communication',
            module: 'Analytics',
            description:
              'Communication analytics — channel stats (sent/delivered/read/failed), broadcast summary. Cached (5 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Reports',
        description: MODULE_DEFINITIONS['Reports']?.description || '',
        basePath: '/reports',
        routes: [
          {
            method: 'GET',
            path: '/reports/financial',
            module: 'Reports',
            description:
              'Financial report — giving totals, trends, category breakdown. Supports date range and branch filter. Cached (5 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'treasurer'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/reports/attendance',
            module: 'Reports',
            description:
              'Attendance report — totals, averages, by-service breakdown, monthly trends. Cached (5 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/reports/members',
            module: 'Reports',
            description:
              'Member report — demographics, status/gender breakdown, monthly growth. Cached (10 min)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'branch_pastor', 'secretary'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/reports/export',
            module: 'Reports',
            description: 'Export a report as CSV (financial, attendance, or members)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor', 'treasurer'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Families',
        description: MODULE_DEFINITIONS['Families']?.description || '',
        basePath: '/families',
        routes: [
          {
            method: 'POST',
            path: '/families',
            module: 'Families',
            description: 'Create a new family group',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/families',
            module: 'Families',
            description: 'List families with search and pagination',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/families/:id',
            module: 'Families',
            description: 'Get family details with members and head of family',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/families/:id',
            module: 'Families',
            description: 'Update family details',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/families/:id',
            module: 'Families',
            description: 'Delete a family group',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/families/:id/members',
            module: 'Families',
            description: 'Add a member to a family with relationship type and head-of-family flag',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/families/:id/members/:memberId',
            module: 'Families',
            description: 'Remove a member from a family',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Templates',
        description: MODULE_DEFINITIONS['Templates']?.description || '',
        basePath: '/templates',
        routes: [
          {
            method: 'POST',
            path: '/templates',
            module: 'Templates',
            description: 'Create a new message template',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/templates',
            module: 'Templates',
            description: 'List templates with channel/status/search filters',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/templates/:id',
            module: 'Templates',
            description: 'Get a template by ID',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/templates/:id',
            module: 'Templates',
            description: 'Update a template',
            auth: 'Required',
            roles: ['church_admin', 'secretary'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/templates/:id',
            module: 'Templates',
            description: 'Delete a template',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Broadcasts',
        description: MODULE_DEFINITIONS['Broadcasts']?.description || '',
        basePath: '/broadcasts',
        routes: [
          {
            method: 'POST',
            path: '/broadcasts',
            module: 'Broadcasts',
            description: 'Create a broadcast campaign with audience filter and channel selection',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/broadcasts',
            module: 'Broadcasts',
            description: 'List broadcast campaigns with status filter and pagination',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/broadcasts/:id',
            module: 'Broadcasts',
            description: 'Get broadcast details with recipient stats',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/broadcasts/:id/cancel',
            module: 'Broadcasts',
            description: 'Cancel a scheduled or sending broadcast',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Visitors',
        description: MODULE_DEFINITIONS['Visitors']?.description || '',
        basePath: '/visitors',
        routes: [
          {
            method: 'POST',
            path: '/visitors',
            module: 'Visitors',
            description: 'Create a visitor record (first-timer tracked)',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'usher', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/visitors',
            module: 'Visitors',
            description: 'List visitors with follow-up status filters and search',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/visitors/:id',
            module: 'Visitors',
            description: 'Get visitor details by ID',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/visitors/:id',
            module: 'Visitors',
            description: 'Update visitor details and follow-up status',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/visitors/:id/assign',
            module: 'Visitors',
            description: 'Assign a visitor to a follow-up team member',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/visitors/:id/convert',
            module: 'Visitors',
            description: 'Convert a visitor to a full member',
            auth: 'Required',
            roles: ['church_admin', 'secretary', 'branch_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Custom Fields',
        description: MODULE_DEFINITIONS['Custom Fields']?.description || '',
        basePath: '/custom-fields',
        routes: [
          {
            method: 'POST',
            path: '/custom-fields',
            module: 'Custom Fields',
            description: 'Create a custom field definition for member profiles',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/custom-fields',
            module: 'Custom Fields',
            description: 'List active custom field definitions',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/custom-fields/:id',
            module: 'Custom Fields',
            description: 'Update a custom field definition',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/custom-fields/:id',
            module: 'Custom Fields',
            description: 'Deactivate a custom field definition',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Users',
        description: MODULE_DEFINITIONS['Users']?.description || '',
        basePath: '/users',
        routes: [
          {
            method: 'POST',
            path: '/users/invite',
            module: 'Users',
            description: 'Invite a new user via email (Supabase admin invite)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/users/:userId/deactivate',
            module: 'Users',
            description: 'Deactivate a user account',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/users/:userId/password-reset',
            module: 'Users',
            description: 'Generate a password reset link for a user',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Notifications',
        description: MODULE_DEFINITIONS['Notifications']?.description || '',
        basePath: '/notifications',
        routes: [
          {
            method: 'GET',
            path: '/notifications',
            module: 'Notifications',
            description: 'List notifications for the authenticated profile',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'PATCH',
            path: '/notifications/read',
            module: 'Notifications',
            description: 'Mark notifications as read',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Sync',
        description: MODULE_DEFINITIONS['Sync']?.description || '',
        basePath: '/sync',
        routes: [
          {
            method: 'POST',
            path: '/sync/push',
            module: 'Sync',
            description: 'Push local changes to the server with conflict detection',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/sync/pull',
            module: 'Sync',
            description: 'Pull changes from the server since last sync timestamp',
            auth: 'Required',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Webhooks',
        description: MODULE_DEFINITIONS['Webhooks']?.description || '',
        basePath: '/webhooks',
        routes: [
          {
            method: 'POST',
            path: '/webhooks/subscribe',
            module: 'Webhooks',
            description:
              'Subscribe to webhook events (member.created, transaction.completed, etc.)',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/webhooks/subscriptions',
            module: 'Webhooks',
            description: 'List active webhook subscriptions',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/webhooks/unsubscribe',
            module: 'Webhooks',
            description: 'Unsubscribe from webhook events',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/webhooks/deliveries',
            module: 'Webhooks',
            description: 'List webhook delivery logs with status filter',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/webhooks/deliveries/:id/retry',
            module: 'Webhooks',
            description: 'Retry a failed webhook delivery',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Permissions',
        description: MODULE_DEFINITIONS['Permissions']?.description || '',
        basePath: '/church/roles',
        routes: [
          {
            method: 'GET',
            path: '/church/roles/:role/permissions',
            module: 'Permissions',
            description: 'Get permissions for a specific role in the church',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
          {
            method: 'POST',
            path: '/church/roles/:role/permissions',
            module: 'Permissions',
            description: 'Override a permission for a role in this church',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'DELETE',
            path: '/church/roles/:role/permissions/:permissionId',
            module: 'Permissions',
            description: 'Remove a role-permission override in this church',
            auth: 'Required',
            roles: ['church_admin'],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/church/roles/:role/permissions/effective',
            module: 'Permissions',
            description: 'Get effective permissions for a role (defaults + overrides)',
            auth: 'Required',
            roles: ['church_admin', 'senior_pastor'],
            permissions: [],
          },
        ],
      },
      {
        module: 'Health',
        description: MODULE_DEFINITIONS['Health']?.description || '',
        basePath: '/health',
        routes: [
          {
            method: 'GET',
            path: '/health',
            module: 'Health',
            description:
              'Health check — database connectivity, Redis availability, and per-queue BullMQ metrics (active, waiting, completed, failed, delayed)',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
        ],
      },
      {
        module: 'Documentation',
        description:
          'API documentation endpoints — this page (HTML) and Swagger/OpenAPI UI (interactive).',
        basePath: '/doc',
        routes: [
          {
            method: 'GET',
            path: '/doc',
            module: 'Documentation',
            description:
              'This page — comprehensive API documentation with all endpoints, descriptions, and auth requirements',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/docs',
            module: 'Documentation',
            description: 'Swagger/OpenAPI interactive documentation UI with request testing',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
          {
            method: 'GET',
            path: '/docs-json',
            module: 'Documentation',
            description: 'OpenAPI 3.0 JSON specification for code generation tools',
            auth: 'Public',
            roles: [],
            permissions: [],
          },
        ],
      },
    ];
  }

  // ─── Helpers ───────────────────────────────────────────

  private guessModuleFromPath(path: string): string {
    const segment = path.split('/').filter(Boolean)[0] || '';
    const moduleMap: Record<string, string> = {
      auth: 'Auth',
      profiles: 'Profiles',
      members: 'Members',
      branches: 'Branches',
      services: 'Attendance',
      attendance: 'Attendance',
      giving: 'Giving',
      events: 'Events',
      sermons: 'Sermons',
      church: 'Church',
      whatsapp: 'WhatsApp',
      media: 'Media',
      templates: 'Templates',
      broadcasts: 'Broadcasts',
      families: 'Families',
      pastoral: 'Pastoral',
      admin: 'Admin',
      assets: 'Assets',
      forms: 'Forms',
      analytics: 'Analytics',
      reports: 'Reports',
      visitors: 'Visitors',
      'custom-fields': 'Custom Fields',
      users: 'Users',
      notifications: 'Notifications',
      sync: 'Sync',
      webhooks: 'Webhooks',
      health: 'Health',
      doc: 'Documentation',
    };
    return moduleMap[segment] || 'Unknown';
  }

  private guessDescription(method: string, path: string, _module: string): string {
    const parts = path.split('/').filter(Boolean);
    const resource = parts[0] || '';
    const id = parts[1] || '';
    const action = parts[2] || '';

    if (path === '/health') return 'Health check endpoint — database, Redis, and queue metrics';
    if (path === '/doc') return 'API documentation page';
    if (path === '/docs') return 'Swagger UI interactive documentation';
    if (path === '/docs-json') return 'OpenAPI 3.0 JSON specification';

    if (method === 'GET' && !id) return `List all ${resource}`;
    if (method === 'GET' && id && !action) return `Get ${resource.slice(0, -1)} by ID`;
    if (method === 'POST' && !id) return `Create a new ${resource.slice(0, -1)}`;
    if (method === 'PATCH' && id && !action) return `Update ${resource.slice(0, -1)} by ID`;
    if (method === 'DELETE' && id && !action) return `Delete ${resource.slice(0, -1)} by ID`;

    return `${method} ${path}`;
  }

  private guessRoles(_module: string, method: string, _path: string): string[] {
    // Backend endpoints typically require some role; default to empty (JWT auth is enough)
    if (method === 'GET') return [];
    return ['church_admin'];
  }

  private getBasePath(module: string): string {
    const basePaths: Record<string, string> = {
      Auth: '/auth',
      Profiles: '/profiles',
      Members: '/members',
      Branches: '/branches',
      Attendance: '/',
      Giving: '/giving',
      Events: '/events',
      Sermons: '/sermons',
      Church: '/church',
      WhatsApp: '/whatsapp',
      Media: '/media',
      Templates: '/templates',
      Broadcasts: '/broadcasts',
      Families: '/families',
      Pastoral: '/pastoral',
      Admin: '/admin',
      Assets: '/assets',
      Forms: '/forms',
      Analytics: '/analytics',
      Reports: '/reports',
      Visitors: '/visitors',
      'Custom Fields': '/custom-fields',
      Users: '/users',
      Notifications: '/notifications',
      Sync: '/sync',
      Webhooks: '/webhooks',
      Permissions: '/church/roles',
      Health: '/health',
      Documentation: '/doc',
    };
    return basePaths[module] || '';
  }

  private renderModuleGroup(group: ModuleGroup, baseUrl: string): string {
    const routesHtml = group.routes
      .map((route) => {
        const fullPath = `${baseUrl}${route.path}`;
        const authBadge =
          route.auth === 'Public'
            ? '<span class="route-badge public">Public</span>'
            : '<span class="route-badge auth">Auth</span>';
        const roleHtml =
          route.roles.length > 0
            ? `<div class="detail-row"><strong>Required Roles</strong><div class="value">${route.roles.map((r) => `<span class="role-pill">${r}</span>`).join(' ')}</div></div>`
            : '';
        const methodClass = `method-${route.method}`;

        return `<div class="route-card">
          <div class="route-header">
            <span class="method-badge ${methodClass}">${route.method}</span>
            <span class="route-path">${route.path}</span>
            <div class="route-badges">${authBadge}</div>
            <span class="route-desc">${route.description}</span>
          </div>
          <div class="route-details">
            <div class="detail-row"><strong>Full URL</strong><div class="value"><code>${fullPath}</code></div></div>
            <div class="detail-row"><strong>Authentication</strong><div class="value">${route.auth === 'Public' ? 'No authentication required' : 'Supabase Auth JWT (Bearer token)'}</div></div>
            ${roleHtml}
            <div class="detail-row">
              <strong>Example Request</strong>
              <div class="endpoint-example"><code>${route.method} ${fullPath}
${route.auth === 'Required' ? 'Authorization: Bearer <your-jwt-token>' : ''}
Content-Type: application/json</code></div>
            </div>
          </div>
        </div>`;
      })
      .join('\n');

    return `<section id="module-${this.slugify(group.module)}" class="module-section">
      <div class="module-header">
        <h2>${group.module}</h2>
        <span class="badge">${group.routes.length} endpoints</span>
      </div>
      <p class="module-description">${group.description}</p>
      <div class="module-base">Base path: <code>/api/v1${group.basePath}</code></div>
      ${routesHtml}
    </section>`;
  }

  private sortModules(groups: ModuleGroup[]): ModuleGroup[] {
    const order = [
      'Auth',
      'Profiles',
      'Members',
      'Branches',
      'Attendance',
      'Giving',
      'Events',
      'Sermons',
      'Church',
      'WhatsApp',
      'Communication',
      'Media',
      'Templates',
      'Broadcasts',
      'Families',
      'Pastoral',
      'Admin',
      'Assets',
      'Forms',
      'Analytics',
      'Reports',
      'Visitors',
      'Custom Fields',
      'Users',
      'Notifications',
      'Sync',
      'Webhooks',
      'Permissions',
      'Health',
      'Documentation',
    ];
    const orderMap = new Map(order.map((name, i) => [name, i]));
    return groups.sort((a, b) => (orderMap.get(a.module) ?? 999) - (orderMap.get(b.module) ?? 999));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

// ─── Express Router Type ────────────────────────────────

interface ExpressLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

interface ExpressRouter {
  stack: ExpressLayer[];
}
