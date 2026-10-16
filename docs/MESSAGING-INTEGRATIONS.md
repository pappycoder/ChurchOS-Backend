# Church-owned messaging accounts

Church admins and super admins can configure messaging under **Settings → Messaging**. Integration administration uses the dedicated reserved `messaging_integrations:read` and `messaging_integrations:update` grants. Other roles, custom role overrides and Admin HQ alone cannot acquire these grants. Sending permissions remain independent: staff can use the church's sending account without seeing credentials.

## Deployment

1. Apply `20261016170000_messaging_credentials` with `npx prisma migrate deploy --config .config/prisma.config.ts`.
2. Run the reference permission seed (`npm run prisma:seed-perms`). Permission cache namespace is v21. Refresh existing web sessions to load the updated permission catalog.
3. Generate a dedicated 32-byte key using `openssl rand -hex 32`. Store it as `MESSAGING_ENCRYPTION_KEY` in the backend/API and persistent worker's secret environment. Use the same key everywhere. Never commit it or place it in frontend environment variables. Back it up outside the database.
4. Deploy backend, worker and frontend. Existing Termii/Resend environment credentials remain the default for churches without a saved setting.
5. An administrator selects the account, saves credentials and sends an explicit test to a controlled recipient. SMS/WhatsApp tests may cost money. A successful API response means provider acceptance; confirm arrival and webhook delivery separately.

## Account modes

- **Platform** uses backend environment credentials. Explicitly switching to this mode erases saved church credentials.
- **Custom** uses only the church's encrypted account. Saving is a full replacement, including sender/device settings. There is no automatic platform fallback after an error, missing key, disabled account or failed decryption.
- **Disabled** blocks the provider and erases saved credentials. Termii covers both SMS and WhatsApp, so disabling Termii blocks both.

Email needs a verified sender address in the connected Resend account. Termii needs an approved SMS sender ID. WhatsApp additionally needs its device ID and the account's webhook signing key. Enter the origin from the Termii dashboard; currently supported origins are `https://api.termii.com` and `https://api.ng.termii.com`. Arbitrary addresses and redirects are rejected to prevent credential exfiltration. Additional provider regions require an explicit allowlist update.

Authentication emails without a church context continue to use platform Resend credentials. Changing a church account cannot disable platform account recovery.

## WhatsApp callbacks

Configure church-owned Termii callbacks at:

```
https://YOUR_BACKEND/api/v1/whatsapp/webhook/CHURCH_UUID
```

The POST authenticates the exact raw body against `X-Termii-Signature` using HMAC-SHA512, matching [Termii's messaging event documentation](https://developers.termii.com/events-and-reports). Supply the signing key used by the account. The church in the verified destination path scopes member phone lookups, inbound records and delivery updates. The sender's phone does not select the tenant. A verification token is optional for legacy GET subscription challenges; it is not an API key.

The original platform callback `/api/v1/whatsapp/webhook` now requires `TERMII_DEFAULT_CHURCH_ID` and rejects processing if that church has selected a custom or disabled Termii account. It accepts Termii SHA512 signatures; the legacy Meta header retains SHA256 compatibility. A shared platform inbound number cannot select an arbitrary church from a matching sender phone. Use church-specific accounts/callbacks for multi-church inbound routing.

## Storage and operational behavior

Credentials use AES-256-GCM with random 12-byte nonces and authenticated church/provider/version context. They are kept in a separate server-only table with RLS enabled and browser-role privileges revoked. API responses contain provider, mode, configuration presence and update time only. Presence does not mean credentials have been remotely verified. Audit entries contain provider/mode, never keys or ciphertext.

Keys are entered through masked, write-only fields, excluded from replay capture, kept out of browser storage and query mutation caches, and cleared after save attempts. Provider errors are reported without response bodies or arbitrary network exception text. HTTP calls have 15-second timeouts and reject redirects. Queued messages contain church IDs and delivery data; workers resolve the current account at delivery time. Rotation/disable therefore applies to queued work as well.

One indexed lookup resolves the account for each tenant send. Decrypted keys are not cached in Redis. Configuration changes do not wait for a credential-cache TTL to expire.

To rotate a provider API key, save the complete replacement configuration, send a controlled test and revoke the old key at the provider. **Do not replace the master encryption key without re-encrypting every custom record first.** Losing that key makes stored credentials unrecoverable; affected churches must re-enter them. Backups retain encrypted historical credentials; revoking the old provider key invalidates those copies.

Background broadcasts still require a persistent queue worker and Redis TCP connectivity for BullMQ. These changes do not provision external accounts, verify sender domains or deploy a worker.

## Verification

Automated coverage includes encryption/tamper handling, cross-tenant/provider ciphertext rejection, rotation/disable, no fallback, provider payloads/error redaction/timeouts, SHA512 signature validation, tenant-bound webhook lookups/statuses, role/HQ authorization, mass-assignment rejection, actual PostgreSQL constraints/RLS privileges and production-browser settings workflows. Provider delivery calls in automated tests use fixtures; no real messages or privileged deployed data are changed.

Run targeted backend checks:

```
npx jest --runInBand test/unit/messaging-integrations test/unit/whatsapp test/unit/auth
```

For PostgreSQL/HTTP checks, migrate an isolated local database (name must contain `test`) and run:

```
TEST_DATABASE_URL=postgresql://.../churchos_messaging_test npx jest --config test/jest-e2e.json --runInBand test/e2e/messaging-integrations.e2e-spec.ts
```

The database privilege check expects the standard Supabase `anon` and `authenticated` roles; create these as no-login roles in a disposable local database. Never use a production database for these tests.

## Local verification results — 2026-10-16

- All 52 migrations applied to a fresh disposable PostgreSQL 17 database.
- Backend unit suite: **72 suites, 1,355 tests passed**.
- PostgreSQL/HTTP integration suite: **26 tests passed**, covering all ten roles with HQ on/off, read-only denial of writes/tests, ciphertext persistence, tenant isolation, input validation, database constraints and browser-role privileges.
- Frontend unit suite: **312 tests passed**.
- Production Chromium workflows: **4 passed**, including account selection/save/test/disable, failed-save secret clearing, read-only controls and no-permission query suppression. The first browser run found a form-reset/account-selector issue; the fix passed the repeated workflow run.
- Backend and frontend production builds, scoped lint and diff whitespace checks passed.
- Full compiled NestJS app started successfully against local PostgreSQL/Redis; health passed and unauthenticated messaging settings returned 401.

External Resend/Termii acceptance in unit tests uses fetch fixtures; HTTP workflow tests mock delivery services; browser tests mock API responses. **No real email/SMS/WhatsApp was sent.** The production database, hosting configuration and real provider credentials were not changed. The production worker and actual end-to-end message receipt must be checked during deployment acceptance.
