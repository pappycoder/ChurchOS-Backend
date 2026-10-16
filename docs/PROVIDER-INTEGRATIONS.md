# Provider accounts and independent services

Settings → Integrations contains reusable provider accounts and independent Email, WhatsApp, SMS, Live calls and Payments sections.

| Service | Supported providers |
|---|---|
| Email | Resend, SendGrid, Mailgun (US/EU) |
| WhatsApp | Termii, Twilio, Meta WhatsApp Cloud API |
| SMS | Termii, Twilio |
| Live staff-to-member calls | Twilio phone bridge |
| Payments | Paystack, Flutterwave v3 |

An account can serve all channels it supports: one Twilio account can be selected for SMS, WhatsApp and live calls, with different sender numbers for each. Termii accounts can serve SMS and WhatsApp with separate sender/device IDs. Email providers use their own credentials; SendGrid and Twilio credentials are not interchangeable even though they belong to the same company. Additional accounts of the same provider can be saved for separate channels or credential rotation.

## Deploy

1. Apply `20261016190000_provider_accounts` with `npx prisma migrate deploy --config .config/prisma.config.ts`. The preceding encrypted-messaging migration must already be applied.
2. Seed the reference permission catalog with `npm run prisma:seed-perms`. The permission cache namespace is v22; refresh existing sessions after deployment.
3. Set a stable 64-character hexadecimal `INTEGRATIONS_ENCRYPTION_KEY` on **both API and worker**, generated using `openssl rand -hex 32`. If unset, the new accounts use the existing `MESSAGING_ENCRYPTION_KEY`. Retain the old messaging encryption key to read legacy records. Back up encryption keys separately from the database; do not replace them without a re-encryption procedure.
4. Set `PUBLIC_API_URL` to the exact public HTTPS backend origin, without `/api/v1` or a trailing path. It is required for Twilio signature validation and automatic outgoing status callbacks. Keep `WEB_URL` correct for checkout return URLs. Platform Flutterwave accounts additionally need their separate `FLUTTERWAVE_WEBHOOK_SECRET`.
5. Deploy backend/API, persistent worker and frontend together. Existing environment and legacy church messaging settings remain the fallback only when the channel uses **Existing / platform configuration** or has never been configured. A disabled/custom channel never silently falls back.
6. Perform the controlled acceptance checks below. Automated tests do not provision external accounts or send real messages, place calls or charge cards.

## Configure accounts and services

1. Add a named provider account. The form displays provider-specific fields, including Twilio Account SID/Auth Token, Meta number ID/access token/app secret, Mailgun domain/region, or payment secret/public keys. Keys are write-only and encrypted before storage.
2. Click **Check credentials**. Inspect the result before assigning the account.
3. Choose **Choose provider account** in the service section and select a compatible checked account. The same account can be selected for multiple compatible services.
4. Set the service sender details and save. Email requires the sender email and optionally sender name/reply-to. Twilio requires an approved E.164 sender number. Termii SMS requires its approved sender ID; WhatsApp requires its device ID and the account's webhook signing key. Meta uses the phone number ID stored on the account.
5. Send a test to a controlled destination. Test messages and calls are real and may incur provider charges. WhatsApp text tests require an open conversation window. API acceptance is not proof of delivery; confirm actual receipt or conversation.

Account inspection states are **unchecked**, **verified**, **limited**, and **rejected**. Verified means the provider accepted account inspection, not that every channel, sender or destination is approved. A 403 inspection response is **limited**, not a successful authentication claim: restricted keys may still send, so test the channel or adjust permissions. Termii account inspection is deliberately limited to structural validation because its balance API puts the secret in a query URL; use a controlled send to test authentication. Rejected and unchecked accounts cannot be newly assigned.

Resend keys may be sending-only. SendGrid inspection checks `mail.send`. Mailgun inspection checks the configured domain/region. Twilio inspection checks the matching active Account SID. Meta checks access to the configured phone number ID. Payment inspection reads balances; it never creates a charge. Sender/domain approval remains with the provider.

## Live calls

Staff use **Call member** on member details. The action requires `calls:create` and `members:all:read`; the backend limits the target to the church and the staff member's visible branch. After explicit confirmation, Twilio rings the phone saved on the authenticated staff profile, then bridges to the member using the church's configured sender number. Staff cannot submit an arbitrary caller identity. Both numbers must use international format. Calls are limited to ten minutes; hanging up ends the conversation. Calls are not recorded by this implementation. This is phone-to-phone live calling, not a browser microphone/WebRTC client or automated text-to-speech.

Settings → Live calls can also connect a controlled test call. This rings the administrator's saved profile phone first. Provider charges may apply to both call legs. Twilio must allow the countries and destinations involved, and trial accounts may require verified destinations.

## Messaging callbacks

Use the callback path displayed for each provider account, on the backend origin:

```
/api/v1/integrations/webhooks/ACCOUNT_UUID
```

- Termii validates the exact raw body with HMAC-SHA512 using the configured signing key.
- Meta validates `X-Hub-Signature-256` with the app secret; its GET subscription challenge uses the saved verification token and returns the raw challenge. The payload phone number ID must match the account.
- Twilio validates `X-Twilio-Signature` using the exact public URL and sorted form fields, and returns raw TwiML for inbound messages. `PUBLIC_API_URL` must match the externally configured origin. Incoming WhatsApp messages use the active WhatsApp binding; status updates are scoped by church, provider ID and account ID.

No message payload or sender phone can select another church. Disabled/replaced WhatsApp bindings reject inbound processing. Provider IDs and account IDs are logged as message metadata; secrets never go into queue jobs. Meta uses Graph API v23.0. Meta templates use their approved template name, language and ordered body variables; Twilio templates use an approved Content SID (`HX…`). Existing Termii template IDs retain their meaning.

Sources: [Termii events](https://developers.termii.com/events-and-reports), [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Twilio live Dial](https://www.twilio.com/docs/voice/twiml/dial).

## Payments and recurring giving

Select the payment account in **Payments**. Its provider becomes the default for new giving and paid event checkouts; an explicit different gateway is rejected. Both accounts may be stored, but one church-owned payment account is selected at a time.

Configure the provider webhook at:

```
/api/v1/integrations/payments/webhook/paystack
/api/v1/integrations/payments/webhook/flutterwave
```

Paystack uses its secret-key HMAC-SHA512 signature. Flutterwave v3 uses its separately configured secret hash (`verif-hash`); modern `flutterwave-signature` HMAC-SHA256/base64 is also accepted when the hash is configured. Before marking success, the backend independently verifies transaction status, amount, currency and reference with the originating merchant's API credentials. Event tickets use the same selected merchant and are issued only after confirmed payment. Flutterwave returns customers to `/payment/complete`, which does not claim payment success from URL parameters.

Each new transaction retains the immutable account that initialized it. Channel changes do not make in-flight payments verify against another church or merchant. Archived accounts block future sends and new charges but remain readable by internal historical settlement. **Keep old provider keys valid until outstanding payments have settled.** The API never returns the saved secret.

Recurring giving supports Paystack. Stored authorizations remain tied to their originating account; switching merchant accounts requires fresh donor authorization. Charges are skipped when the selected merchant differs or Paystack is disabled. The recurring page reads a non-secret capability endpoint and disables new schedule creation when Paystack is unavailable while leaving existing records readable.

Sources: [Paystack API](https://paystack.com/docs/api/), [Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks).

## Security and performance

Integration administration uses reserved `integrations:read/update` permissions for church admins and super admins. Admin HQ and custom role overrides do not grant integration administration. Ordinary message/call/payment users do not need permission to read provider accounts or keys.

Provider accounts use AES-256-GCM, random nonces and authenticated church/account-version/provider context. Account credentials are immutable: rotation creates a replacement account. The account and channel tables have RLS and no browser-role access. Public sender settings reject secret fields; unknown credential fields and cross-provider/channel assignments are rejected. Only fixed/allowlisted provider endpoints are called; redirects are rejected and requests time out after 15 seconds. Provider error bodies and arbitrary transport exceptions are not exposed. Subscription tokens are removed from error log paths and telemetry query strings.

Settings perform one metadata fetch with a 60-second freshness window. Channel/account lookups use indexed keys. Workers resolve current messaging settings at delivery time; payment verification uses its pinned account. Decrypted credentials are not stored in Redis or returned to the frontend. Browser key forms are excluded from replay capture, avoid mutation-cache variables and clear secrets after every save attempt.

## Local acceptance coverage

Automated coverage includes provider-specific payloads, credential-format errors, limited/rejected inspection, sender and channel validation, shared accounts, encryption/tampering/isolation, all ten roles with HQ on/off, signed Meta/Twilio callbacks with raw responses, database browser-role denial, archived-account historical settlement, wrong-merchant signatures, payment amount/currency mismatches, branch-scoped live calling, and production-browser workflows. See the verification result section added after the final run.

After deployment, manually verify each enabled provider with actual approved sender accounts, delivery/status callbacks, a real live conversation, and test-mode giving/event settlement. Queue-based broadcasts still need a persistent Redis-connected worker.

## Verification results — 2026-10-16

- Fresh isolated PostgreSQL 17: **53 migrations applied successfully**.
- Backend unit suite: **77 suites, 1,374 tests passed**. Includes provider-specific adapters, encryption/field validation, live-call scope/permissions, wrong-merchant and amount/currency settlement rejection, and verification-token log privacy.
- Real PostgreSQL + HTTP suites: **54 checks passed**, including all ten roles with HQ on/off, safe metadata, cross-church rejection, independent/shared channel bindings, RLS/browser-role denial, archived account historical access, raw Meta challenges and signed Twilio URL-encoded callbacks.
- Frontend unit suite: **312 tests passed**.
- Production Chromium: **16 workflows passed**, covering the five new integration/live-call workflows and eleven existing read-only workflow regressions.
- Backend/frontend production builds, scoped lint and whitespace checks passed. Full compiled NestJS startup with disposable local PostgreSQL/Redis passed health checks and returned 401 for unauthenticated integration settings access.

Provider HTTP requests in unit tests, verification/delivery in HTTP tests and API responses in browser tests use fixtures. No real messages, live calls, payment charges or deployed data changes occurred. Configure/deploy as above, then complete live provider acceptance separately. Disposable test containers and volumes were removed after verification.
