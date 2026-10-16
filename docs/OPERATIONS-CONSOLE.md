# Backend operations console

Run `npm run console` or `bash scripts/console.sh` from this repository. The script also works by absolute path from another directory. Menus stay open after command failures, EOF exits cleanly, and Ctrl-C stops the foreground command. API and worker processes run in the foreground; production supervision remains the hosting service's responsibility.

## Start safely

```sh
bash scripts/console.sh --help
bash scripts/console.sh --list
bash scripts/console.sh --env .env.production --dry-run --action migration-deploy
bash scripts/console.sh --env .env.production
```

Use Node.js 20.19+ or 22.12+, Bash 3.2+, and npm. Select pnpm with `--manager pnpm` when using the existing pnpm lockfile. Installation uses `npm ci --include=dev` or `pnpm install --frozen-lockfile`; it never creates or rewrites a lockfile implicitly. Dependencies and a generated Prisma client are needed for database/account actions.

The default environment is `.env`. `--env FILE` selects another dotenv file, relative to the invocation directory. **Selected file values override inherited environment values.** The console parses the file without sourcing it or evaluating shell substitutions. The selected path and redacted database host/name are shown for review. `env-init` copies `.env.example` with mode 0600 and refuses to overwrite an existing file. Edit the file before connecting to services. Doctor reports missing configuration and overly broad environment-file permissions without printing secrets.

`--dry-run` prints a plan only: no package commands, network requests, account creation, backups or mutations occur. It still checks local-only restrictions. `--action ID` runs one action with the same prompts and safeguards as the menu. There is no `--yes` or force-confirmation shortcut.

## Menus

| Menu | Operations |
|---|---|
| Setup | Environment template, diagnostics, locked install, Prisma generation, local Docker services |
| Development and quality | Dev API, production API build/start, persistent worker, lint/check/fix, type checks, unit/integration tests, console tests, dependency audit, combined verification |
| Database and backups | Migration status/deploy/development, Studio, row inventory, public-schema backup/restore, application clear, local schema reset |
| Permissions and admins | Source/catalog audit, database template audit, reference permission seed, permission-cache invalidation, church list, super-admin/church-admin provisioning, demo-account retirement |
| Maintenance | Bounded API health, private-storage preview/apply/prune, encryption-key rotation preview/apply, email backfill |

Use `--list` for exact action IDs. Build/production start/worker run with `NODE_ENV=production`; dev runs with `NODE_ENV=development`; tests use `NODE_ENV=test`. Combined verification stops on the first failing command. Regular lint checks do not modify source; lint-fix is separate. Integration tests require a local database whose name contains `test`; schema reset and migration development also accept local names containing `dev` or `local`. Full demo seeding requires both an isolated local database and local Supabase, preventing public shared-password cloud accounts from being minted accidentally. Start Docker services before DB-dependent actions; stopping them preserves volumes.

## Administrators

```sh
npm run create:super-admin
npm run create:church-admin
# Select a different environment:
npm run create:church-admin -- --env .env.production
```

`seed-super-admin` now uses the same protected flow; the old TypeScript filename is a compatibility bridge.

Choose a new Supabase login or explicitly link an orphan authentication UUID that has no application profile. Enter email, hidden password twice for a new login, names and optional phone. Passwords require at least 12 characters with upper/lowercase, number and symbol, and travel through stdin rather than command arguments, environment variables or files. Remote Supabase admin calls require HTTPS. A real `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are mandatory; fake DB-only login identities are never created.

Choose an existing active church by UUID or name a new church. The console uses/creates an HQ branch within that church and creates a profile with exactly the selected role and `is_admin_hq=true`. HQ broadens branch scope within that church; it does not bypass church isolation or create additional action grants. Reference roles/permissions must already exist. Configure authenticator security in the application after provisioning.

Review the account, role, church, auth project and database, then type the displayed confirmation token. The token binds database identity and auth project. Existing profiled users are never silently promoted, adopted, assigned to a different church, or given a new password. Existing orphan linking requires matching email and UUID. Church, branch, profile and secret-free audit record are transactional; if that transaction fails, only a newly created auth identity is compensated. Existing auth identities are retained. An auth-provider failure during compensation is reported for manual orphan review. Supabase and PostgreSQL are separate systems, so provider/network failures can still require reconciliation.

## Permissions

`permissions-seed` reconciles the global reference roles and permission mappings without inserting demo church data. It then deletes only `perms:*` Redis keys through bounded SCAN batches, never FLUSHALL. Both Redis TCP and Upstash REST configurations are supported. If the database seed succeeds but Redis invalidation fails, the action returns failure and explicitly reports the partial result; run `permissions-cache` successfully before validating new grants. Restarting an API process alone does not clear persisted Redis keys. Church overrides are not reset by this action.

`demo-retire` is separate and explicitly confirmed. It deactivates profiles linked to `@churchos.dev` auth users, removes their backend session approvals and bans those auth accounts. It does not delete church/business records or non-demo identities. Partial provider failures are reported, and the action is safe to retry. It is not a claim that every external Supabase token is physically deleted; backend profile/approval checks and the auth ban enforce application denial.

## Database backups, clear, reset and restore

Install **matching-major PostgreSQL `pg_dump` and `pg_restore` tools**. Use `OPS_PG_BIN_DIR=/path/to/postgresql/16/bin` in the selected dotenv file if the matching tools are not first on PATH. The console checks server/client majors and refuses incompatible tooling rather than generating a backup that might not restore to that server.

Backups live in ignored `.ops/backups/`, with a private directory, mode-0600 custom-format `.dump` files and hash/target/version metadata sidecars. They cover **public schema only**, including migration history and application definitions/data. They are not full Supabase backups: authentication identities, storage bytes and deployment secrets require separate backup procedures. Backups are not encrypted; protect their storage and preserve encryption keys separately.

| Action | Effect |
|---|---|
| `db-inventory` | Read-only counts for current Prisma application tables |
| `db-backup` | Produces a custom-format public-schema backup and verifies its archive listing/hash |
| `db-clear` | Takes a backup, then truncates all Prisma application tables together in a transaction, including reference roles/permissions |
| `db-reset` | Local dev/test only; takes a backup, recreates public schema and reapplies migrations; reference/demo seeding remains explicit |
| `db-restore` | Verifies a trusted console dump plus matching metadata/hash, previews its original target, backs up the destination, then restores public schema atomically |

**Stop API/worker writers before clear/reset/restore, key rotation or storage maintenance.** Confirm the displayed host/database and operation-specific token; a mismatched token or EOF cancels before mutation. Confirmation is checked again in the helper against the effective target. A failed mandatory backup prevents the destructive step. Migration deployment/development, storage apply/prune and pastoral key rotation also back up public schema first.

Clear derives its table list from Prisma metadata and uses TRUNCATE RESTRICT, with an external-reference preflight; no CASCADE deletion is used. It preserves `_prisma_migrations`, Supabase Auth and storage tables. Reset additionally checks for cross-schema dependencies so it can refuse unsafe cascades into protected schemas. Restore uses PostgreSQL's single-transaction/exit-on-error behavior and no cascade. Schema reset is refused for remote or production-named databases; use reviewed migrations for production. Development locality is a guardrail, not proof against an operator-created tunnel to production.

After clearing, seed reference permissions again and create/link administrators explicitly. Authentication accounts remain even when profiles have been cleared; use explicit orphan UUID linking when appropriate. Before resuming writers after clear/reset/restore, invalidate permission caches explicitly. Restore may restore older migration history: check migration status before applying newer code. Retain old pastoral keys until encrypted notes are verified after rotation. Storage pruning additionally requires an independent storage backup; a public-schema DB backup does not contain file bytes. Maintenance preview commands are dry-run by default in their underlying scripts.

## Verification

```sh
npm run ops:test
# Only a disposable local database containing "test" in its name:
OPS_TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/churchos_ops_test npm run ops:test:integration
```

The unit/console suite tests every action's dry-run, invalid arguments, EOF and cancellation, command failure propagation, Ctrl-C, dotenv injection resistance, private env-file creation, hidden password handling, account compensation and permission-cache boundaries. Health uses a local HTTP fixture for success/degraded/timeout behavior.

Integration tests use real PostgreSQL, migrations, pg_dump/pg_restore, Bash prompts and transactional application writes, plus a **local Supabase Admin HTTP fixture**. They cover both admin roles, explicit orphan linking, auth compensation, external FK/view protections, backup failure, corruption rejection, clear, restore, reset and selective demo retirement. `OPS_TEST_PG_CONTAINER` optionally uses matching tools from a specifically supplied disposable Docker container. Tests never provision live Supabase users or clear a deployed database. Real provider/hosting credentials and worker delivery still require deployment smoke testing.

Validation for this change: 18 backend console/unit tests and 13 real PostgreSQL workflow cases passed; the frontend console adds 11 passing console/unit cases. Both production builds, changed-file lint, Bash syntax checks, the legacy admin compatibility bridge and a POSIX pseudo-terminal smoke test passed. The frontend was also started through its console and its hydrated production login was verified in Chromium. The disposable database and local authentication fixture were removed after verification. No real church records or live authentication accounts were changed.

For the optional POSIX controlling-terminal smoke test, run `python3 test/ops/terminal.test.py`. It uses only temporary files and a child process; no service credentials are needed.
