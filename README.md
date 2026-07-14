# ChurchOS Backend

NestJS API for ChurchOS — Church Management & Digital Ministry Platform.

## Overview

This repository contains the backend API for ChurchOS. It is built with:

- **NestJS** — Modular TypeScript backend framework
- **Supabase** — PostgreSQL database + Auth + Storage + Realtime
- **Upstash Redis** — Caching and BullMQ job queues
- **Paystack / Flutterwave** — Payment processing
- **360dialog** — WhatsApp Business API
- **Resend** — Email delivery
- **Termii** — SMS fallback

## Repository Structure

```
ChurchOS-Backend/
├── .github/
│   └── workflows/
│       └── populate-project-issues.yml  # Auto-create GitHub issues from CSV
├── scripts/
│   └── populate-issues.js               # Issue population script
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── auth/                            # Supabase Auth integration
│   ├── members/                         # Member management
│   ├── attendance/                      # Attendance and services
│   ├── giving/                          # Payments and receipts
│   ├── whatsapp/                        # WhatsApp webhooks and commands
│   ├── events/                          # Events and ticketing
│   ├── media/                           # Sermons and media
│   ├── pastoral/                        # Pastoral care and intelligence
│   ├── admin/                           # RBAC, config, reports
│   ├── supabase/                        # Supabase client module
│   ├── common/                          # Guards, interceptors, filters
│   └── config/                          # Environment configuration
├── churchos_github_projects_import.csv  # Project tasks
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Supabase project
- Upstash Redis instance

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```env
NODE_ENV=development
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
REDIS_URL=redis://localhost:6379
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
360DIALOG_API_KEY=
360DIALOG_WEBHOOK_SECRET=
RESEND_API_KEY=
TERMII_API_KEY=
OPENAI_API_KEY=
WEB_URL=http://localhost:3000
```

### Running Locally

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Database Migrations

Migrations are managed via Supabase CLI:

```bash
# Create new migration
supabase migration new add_members_table

# Apply migrations
supabase db push

# Reset local database
supabase db reset
```

## GitHub Project Automation

This repo includes a GitHub Actions workflow that automatically creates issues from `churchos_github_projects_import.csv` and adds them to the central ChurchOS GitHub Project.

### Setup

1. Go to **Settings → Secrets and variables → Actions**
2. Add these repository secrets:

| Secret | Value |
|---|---|
| `GH_PAT` | Personal Access Token with `repo`, `project`, `read:org` scopes |
| `ORG_NAME` | `pappycoder` |
| `PROJECT_NUMBER` | `2` |

3. The workflow runs automatically when `churchos_github_projects_import.csv` is pushed to `main`
4. You can also trigger it manually from the **Actions** tab

### Creating the PAT

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Select:
   - ✅ `repo`
   - ✅ `read:org`
   - ✅ `project`
4. Generate and copy the token
5. Paste it as `GH_PAT` secret in this repo

### Updating Tasks

To update or add new tasks:

1. Edit `churchos_github_projects_import.csv`
2. Commit and push to `main`
3. The workflow will:
   - Create new issues
   - Update existing issues (matched by title)
   - Add/update them in project #2 with custom fields (Repository, Phase, Module, Priority)

## API Documentation

Once running, API documentation is available at:

```
http://localhost:3001/api/v1/docs
```

## Deployment

The project is configured for deployment on Railway / Render / Fly.io via the included Dockerfile and GitHub Actions workflow.

## Related Repositories

- [ChurchOS-Web](https://github.com/pappycoder/ChurchOS-Web) — Next.js PWA
- [ChurchOS-Mobile](https://github.com/pappycoder/ChurchOS-Mobile) — Flutter mobile app
- [ChurchOS Project Board](https://github.com/orgs/pappycoder/projects/2)

---

*ChurchOS Backend — Built for Nigerian churches.*
