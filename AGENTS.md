# AGENTS.md — ChurchOS Backend

> This file documents the ChurchOS Backend project for AI coding agents and developers.
> It describes the project's purpose, architecture, conventions, and must be updated with every change.

---

## Project Overview

**ChurchOS Backend** is the REST API server for the ChurchOS platform — a Church Management & Digital Ministry system built for Nigerian churches. It handles all server-side business logic, database operations, authentication, payment processing, and third-party integrations.

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 10 (TypeScript) |
| ORM | Prisma 7 (PostgreSQL) |
| Auth | Supabase Auth (JWT, MFA) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger / OpenAPI 3.0 |
| Payments | Paystack, Flutterwave |
| WhatsApp | 360dialog Business API |
| Email | Resend |
| SMS | Termii |
| Cache/Queue | Upstash Redis (BullMQ) |
| Monitoring | Sentry, Logtail |

### Key Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run start:dev      # Start in watch mode
npm run start:prod     # Start compiled production build
npm run lint           # ESLint + Prettier
npm run test           # Jest unit tests
npx prisma generate    # Regenerate Prisma Client after schema changes
npx prisma migrate dev # Create a new migration
npx prisma studio      # Visual database browser
npx prisma db seed     # Seed database with dev data
npm run prisma:seed    # Alternative seed command
```

## Architecture

### Module Structure

```text
src/
├── main.ts                 # Application bootstrap, Swagger, CORS, ValidationPipe, ExceptionFilter
├── app.module.ts           # Root module — imports ConfigModule, PrismaModule
├── config/                 # Environment config, validation schema
│   ├── env.validation.ts   # Zod schema for env vars (validated at startup)
│   └── index.ts            # Barrel exports
├── prisma/                 # Prisma ORM integration (global module)
│   ├── prisma.module.ts    # Global PrismaModule registration
│   ├── prisma.service.ts   # PrismaService with lifecycle hooks (connect/disconnect)
│   └── index.ts            # Barrel exports
├── common/                 # Shared guards, interceptors, decorators, filters
│   ├── common.module.ts    # Global module (AuditLoggingService)
│   ├── decorators/         # @CurrentUser, @RequireRoles, Swagger helpers
│   ├── filters/            # GlobalExceptionFilter
│   ├── interceptors/       # LoggingInterceptor (registered globally)
│   └── services/           # AuditLoggingService
├── supabase/               # Supabase client wrapper (global)
│   ├── supabase.service.ts
│   ├── supabase.module.ts
│   └── index.ts
├── auth/                   # Authentication & authorization (Supabase Auth)
│   ├── auth.module.ts      # Passport + JWT strategy
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── strategies/         # JwtStrategy (passport-jwt)
│   └── decorators/         # @RequireRoles()
├── members/                # Member CRUD, search, families [PLANNED]
├── attendance/             # Service attendance, check-in (QR, WhatsApp, manual) [PLANNED]
├── giving/                 # Giving categories, transactions, recurring, receipts [PLANNED]
├── events/                 # Events, registrations, ticketing [PLANNED]
├── whatsapp/               # WhatsApp webhooks, commands, broadcasts [PLANNED]
├── media/                  # Sermon uploads, media library [PLANNED]
├── pastoral/               # Pastoral notes, life events, risk scoring [PLANNED]
├── admin/                  # RBAC, church config, reports, dashboard [PLANNED]
└── supabase/               # Supabase client (Auth + Storage only) [PLANNED]
```

### Conventions

- **All API routes** are prefixed with `/api/v1`.
- **DTOs** use `class-validator` decorators for automatic validation via `ValidationPipe`.
- **Prisma queries** must always scope by `church_id` for multi-tenant data isolation.
- **Response format** is standardized: `{ success: true, data: ..., message: ... }`.
- **Error format** is standardized: `{ success: false, error: { code, message, details, timestamp, path, method } }`.
- **File naming** uses kebab-case for files, PascalCase for classes.
- **Modules** follow the NestJS convention: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.entity.ts`.
- **Environment variables** are validated at startup via Zod schema in `src/config/env.validation.ts`.
- **Swagger decorators** use reusable helpers from `src/common/decorators/` (e.g., `@ApiCreateEndpoint()`).

### Database

- PostgreSQL 16 via Prisma ORM 7.
- Schema defined in `prisma/schema.prisma` (26+ models, 8 enums).
- All tables use UUID primary keys.
- Snake_case column names via `@@map()`.
- Multi-tenant isolation enforced via `church_id` on all queryable models.
- Prisma 7 uses `@prisma/adapter-pg` driver adapter for connection management.

### Environment Variables

Copy `.env.example` to `.env`. All variables are validated at startup via Zod schema.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `production`, or `test` |
| `PORT` | Yes | Server port (default: 3001) |
| `WEB_URL` | Yes | Frontend URL for CORS |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase key |
| `SUPABASE_ANON_KEY` | Yes | Client-side Supabase key |
| `REDIS_URL` | Yes | Upstash Redis connection |
| `PAYSTACK_SECRET_KEY` | No | Paystack payment processing |
| `FLUTTERWAVE_SECRET_KEY` | No | Flutterwave payment processing |
| `360DIALOG_API_KEY` | No | WhatsApp Business API |
| `RESEND_API_KEY` | No | Email delivery |
| `TERMII_API_KEY` | No | SMS fallback |
| `OPENAI_API_KEY` | No | AI chatbot features |

## Related Projects

- **ChurchOS-Web** — Next.js 14 PWA frontend (`../ChurchOS-Web/`)
- **ChurchOS-Mobile** — Flutter mobile app (`../ChurchOS-Mobile/`)
- **GitHub Project Board** — [https://github.com/orgs/pappycoder/projects/2](https://github.com/orgs/pappycoder/projects/2)

---

## Changelog

All notable changes to this project are documented below. Update this section with every change.

### [Unreleased]

- **2026-07-14** — Initial NestJS project setup with TypeScript strict mode.
  - Created `package.json` with NestJS core, Prisma, Swagger, class-validator deps.
  - Configured `tsconfig.json` with strict mode and all strict flags enabled.
  - Configured `nest-cli.json` for build settings.
  - Set up `.eslintrc.js` with TypeScript-ESLint + Prettier integration.
  - Set up `.prettierrc` with project formatting rules.
  - Created `src/main.ts` with bootstrap: ValidationPipe, CORS, Swagger at `/api/v1/docs`.
  - Created `src/app.module.ts` with ConfigModule (global) + PrismaModule (global).
  - Created `src/prisma/prisma.service.ts` — PrismaService with lifecycle hooks and logging.
  - Created `src/prisma/prisma.module.ts` — Global PrismaModule.
  - Created `src/prisma/index.ts` — Barrel exports.
  - Fixed 4 Prisma schema validation errors (missing back-relations, @unique constraint).
  - Verified `npx nest build` compiles with zero errors.
  - Added JSDoc documentation and step-by-step comments to all source files.
  - Created this `AGENTS.md` file.

- **2026-07-14** — Changed PostgreSQL host port from 5432 to 5433 in `docker-compose.yml` to avoid conflict with existing PostgreSQL installation. Updated `DATABASE_URL` in `.env.example` to match.
- **2026-07-14** — Created `prisma.config.ts` for Prisma 7 compatibility. Prisma 7 requires the database URL to be configured here instead of in `schema.prisma`. Installed `dotenv` for `.env` variable loading.
- **2026-07-14** — Fixed TypeScript build: excluded `prisma.config.ts` from `tsconfig.build.json`, removed deprecated `ignoreDeprecations: "6.0"` from `tsconfig.json` (incompatible with TypeScript 5.6+).
- **2026-07-14** — Fixed ESLint parsing error for `prisma.config.d.ts` (Prisma 7 generated file). Removed deprecated `baseUrl` from `tsconfig.json`, updated `paths` to use relative `"./src/*"`. Added `prisma.config.ts` and `prisma.config.d.ts` to ESLint ignorePatterns.
- **2026-07-15** — Enhanced Swagger/OpenAPI documentation setup (Task #5).
  - Enhanced `DocumentBuilder` configuration with detailed API description, contact, and license info.
  - Added named Bearer Auth scheme `supabase-auth` with full configuration.
  - Added `deepScanRoutes` and `persistAuthorization` Swagger UI options.
  - Created `src/common/decorators/` with reusable Swagger decorators:
    - `ApiPaginatedResponse()` — Standard paginated response wrapper with query params.
    - `ApiCreateEndpoint()` — Standard CRUD create documentation.
    - `ApiListEndpoint()` — Standard CRUD list documentation.
    - `ApiGetEndpoint()` — Standard CRUD single-item documentation.
    - `ApiUpdateEndpoint()` — Standard CRUD update documentation.
    - `ApiDeleteEndpoint()` — Standard CRUD delete documentation.
    - `CurrentUser()` — Parameter decorator for authenticated user.
    - `CurrentUserProfile()` — Parameter decorator for user's church profile.
- **2026-07-15** — Added environment validation with Zod (Task #6).
  - Installed `zod` for runtime schema validation.
  - Created `src/config/env.validation.ts` with full Zod schema for all env vars.
  - Required vars: `NODE_ENV`, `PORT`, `WEB_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `REDIS_URL`.
  - Optional vars: `PAYSTACK_*`, `FLUTTERWAVE_SECRET_KEY`, `360DIALOG_*`, `RESEND_API_KEY`, `TERMII_API_KEY`, `OPENAI_API_KEY`.
  - Updated `src/main.ts` to import and validate env vars at startup before any other code runs.
  - Application fails fast with descriptive error messages if required vars are missing.
- **2026-07-15** — Added global exception filter (Task #7).
  - Created `src/common/filters/global-exception.filter.ts` with standardized error responses.
  - Handles: HttpException, ZodError, Prisma errors (P2002, P2025, P2003, P2014), generic errors.
  - Returns consistent error format: `{ success, error: { code, message, details, timestamp, path, method } }`.
  - Registered globally in `main.ts` via `app.useGlobalFilters()`.
- **2026-07-15** — Created seed data script (Task #2 — continued).
  - Created `prisma/seed.ts` with development data.
  - Seeds: 1 church, 1 branch, 6 giving categories, 2 services, 10 members, 1 admin profile, 3 transactions.
  - Added `tsconfig.seed.json` for seed file compilation.
  - Excluded `prisma/` from main build to avoid rootDir conflicts.
  - Run with `npx prisma db seed`.

- **2026-07-15** — Added request logging and audit logging (Task #8).
  - Created `src/common/interceptors/logging.interceptor.ts` — logs method, URL, status, duration, IP, user agent, request ID.
  - Created `src/common/services/audit-logging.service.ts` — records data mutations to `audit_logs` table.
  - Created `src/common/common.module.ts` — global module providing AuditLoggingService.
  - Registered LoggingInterceptor globally in `main.ts`.

- **2026-07-15** — Added Supabase Auth module and JWT guard (Task #9).
  - Created `src/supabase/` — SupabaseService + global SupabaseModule.
  - Created `src/auth/strategies/jwt.strategy.ts` — Passport JWT strategy for Supabase tokens.
  - Created `src/auth/guards/jwt-auth.guard.ts` — JWT validation guard.
  - Created `src/auth/auth.module.ts` — Passport + JWT strategy registration.
  - Added `SUPABASE_JWT_SECRET` to env validation and `.env.example`.
  - Installed `@supabase/supabase-js`, `@nestjs/passport`, `passport`, `passport-jwt`.

- **2026-07-15** — Added RBAC decorators and guard (Task #10).
  - Created `src/auth/decorators/roles.decorator.ts` — `@RequireRoles()` decorator.
  - Created `src/auth/guards/roles.guard.ts` — checks user role from Profile model.

- **2026-07-15** — Created production Dockerfile (Task #11).
  - Multi-stage build: deps → prisma generate → build → production runner.
  - Non-root user (churchos:1001).
  - Created `.dockerignore`.

- **2026-07-15** — Created GitHub Actions CI/CD workflow (Task #12).
  - Created `.github/workflows/ci.yml` — lint, build, test with PostgreSQL service container.

- **2026-07-15** — Added response interceptor (Phase 0 remaining).
  - Created `src/common/interceptors/response.interceptor.ts` — wraps all responses in `{ success, data, meta }`.
  - Supports paginated responses with `total`, `page`, `limit`, `totalPages` in meta.
  - Registered globally in `main.ts`.

- **2026-07-15** — Added Redis module (Phase 0 remaining).
  - Created `src/redis/redis.service.ts` — Upstash Redis client with convenience methods.
  - Created `src/redis/redis.module.ts` — global RedisModule.
  - Installed `@upstash/redis`.

- **2026-07-15** — Added health check endpoint (Phase 0 remaining).
  - Created `src/health/health.controller.ts` — `GET /health` checks database + Redis.
  - Returns `{ status, timestamp, uptime, services: { database, redis } }`.

- **2026-07-15** — Added Sentry error tracking (early setup).
  - Installed `@sentry/nestjs`, `@sentry/profiling-node`.
  - Created `src/common/interceptors/sentry.interceptor.ts` — captures exceptions with context.
  - Added `SENTRY_DSN` to env validation (optional).
  - Sentry only activates when `SENTRY_DSN` is set.

- **2026-07-15** — Added rate limiting (early setup).
  - Installed `@upstash/ratelimit`.
  - Created `src/common/guards/rate-limit.guard.ts` — sliding window rate limiter.
  - Created `@RateLimit()` decorator for per-route custom limits.
  - Default: 100 req/min, Auth: 10 req/min, Sensitive: 5 req/min.

- **2026-07-15** — Added Helmet security headers and compression (early setup).
  - Installed `helmet`, `compression`.
  - Added `app.use(helmet())` and `app.use(compression())` in `main.ts`.

- **2026-07-15** — Added graceful shutdown hooks (early setup).
  - Added `app.enableShutdownHooks()` in `main.ts`.
  - Ensures Prisma, Redis disconnect cleanly on SIGTERM/SIGINT.

- **2026-07-15** — Set up Jest test infrastructure (Phase 1).
  - Created `jest.config.ts` with `ts-jest` preset, `@/` path aliases, coverage thresholds.
  - Added `jest` to `tsconfig.json` types array.
  - Excluded `jest.config.ts` from `tsconfig.build.json`.
  - Created `test/helpers/prisma-mock.helper.ts` — generic Proxy-based Prisma mock factory.
  - Created `test/helpers/test-app.helper.ts` — NestJS test app builder with production-like config.
  - Created `test/fixtures/` — mock data for churches, branches, members, profiles, users.

- **2026-07-15** — Added RequestContext middleware + service (Phase 1).
  - Created `src/common/services/request-context.service.ts` — AsyncLocalStorage-based tenant context.
  - Created `src/common/middleware/request-context.middleware.ts` — extracts userId, churchId, branchId, role from JWT.
  - Registered middleware in `CommonModule` via `NestModule.configure()`.
  - 11 unit tests passing: `test/unit/common/request-context.service.spec.ts`.

- **2026-07-15** — Completed Auth module (Phase 1).
  - Created `src/auth/dto/register.dto.ts` — registration DTO with class-validator decorators.
  - Created `src/auth/dto/auth-response.dto.ts` — RegisterResponseDto, ProfileResponseDto.
  - Created `src/auth/auth.service.ts` — register (Supabase + Prisma transaction), getProfile.
  - Created `src/auth/auth.controller.ts` — POST /auth/register (public), GET /auth/me (protected).
  - Updated `src/auth/auth.module.ts` — imports SupabaseModule, registers AuthService + AuthController.
  - 8 unit tests passing: `test/unit/auth/auth.service.spec.ts`.

- **2026-07-15** — Fixed TypeScript/ESLint config for test files.
  - Moved `rootDir: "./src"` from `tsconfig.json` to `tsconfig.build.json` only.
  - Expanded `tsconfig.json` exclude list: `test`, `jest.config.*`.
  - Created `tsconfig.eslint.json` — includes both `src/` and `test/` for ESLint parsing.
  - Updated `.eslintrc.js` to use `tsconfig.eslint.json` for parser project.
  - All 19 tests pass, build compiles clean, lint passes with zero errors.
