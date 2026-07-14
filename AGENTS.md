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
| ORM | Prisma 6 (PostgreSQL) |
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
```

## Architecture

### Module Structure

```text
src/
├── main.ts                 # Application bootstrap, Swagger setup, CORS, ValidationPipe
├── app.module.ts           # Root module — imports ConfigModule, PrismaModule
├── prisma/                 # Prisma ORM integration (global module)
│   ├── prisma.module.ts    # Global PrismaModule registration
│   ├── prisma.service.ts   # PrismaService with lifecycle hooks (connect/disconnect)
│   └── index.ts            # Barrel exports
├── auth/                   # Authentication & authorization (Supabase Auth)
│   ├── decorators/         # @RequirePermissions, @CurrentUser
│   ├── guards/             # SupabaseAuthGuard, PermissionsGuard
│   └── strategies/         # JWT strategy
├── members/                # Member CRUD, search, families
├── attendance/             # Service attendance, check-in (QR, WhatsApp, manual)
├── giving/                 # Giving categories, transactions, recurring, receipts
├── events/                 # Events, registrations, ticketing
├── whatsapp/               # WhatsApp webhooks, commands, broadcasts
├── media/                  # Sermon uploads, media library
├── pastoral/               # Pastoral notes, life events, risk scoring
├── admin/                  # RBAC, church config, reports, dashboard
├── supabase/               # Supabase client (Auth + Storage only)
├── common/                 # Shared guards, interceptors, exception filters
│   ├── filters/            # GlobalExceptionFilter
│   ├── interceptors/       # ResponseTransformer
│   └── ...
├── config/                 # Environment config, validation schema
└── ...
```

### Conventions

- **All API routes** are prefixed with `/api/v1`.
- **DTOs** use `class-validator` decorators for automatic validation via `ValidationPipe`.
- **Prisma queries** must always scope by `church_id` for multi-tenant data isolation.
- **Response format** is standardized: `{ success: true, data: ..., message: ... }`.
- **Error format** is standardized: `{ success: false, error: { code, message, details } }`.
- **File naming** uses kebab-case for files, PascalCase for classes.
- **Modules** follow the NestJS convention: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.dto.ts`, `*.entity.ts`.

### Database

- PostgreSQL via Prisma ORM.
- Schema defined in `prisma/schema.prisma` (26+ models, 8 enums).
- All tables use UUID primary keys.
- Snake_case column names via `@@map()`.
- Multi-tenant isolation enforced via `church_id` on all queryable models.

### Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key |
| `SUPABASE_ANON_KEY` | Client-side Supabase key |
| `REDIS_URL` | Upstash Redis connection |
| `PAYSTACK_SECRET_KEY` | Paystack payment processing |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave payment processing |
| `360DIALOG_API_KEY` | WhatsApp Business API |
| `RESEND_API_KEY` | Email delivery |
| `TERMII_API_KEY` | SMS fallback |
| `OPENAI_API_KEY` | AI chatbot features |

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
