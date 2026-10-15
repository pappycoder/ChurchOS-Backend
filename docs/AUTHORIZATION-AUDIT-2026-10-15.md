# Authorization audit — 15 October 2026

## Result and scope

The application was not consistently protected by permissions alone. Controllers still attached a legacy RolesGuard, several actions lacked permission requirements, and some service checks used fixed roles. This change removes active legacy controller role guards and the appointment booking role ceiling. Authentication, session approval, tenant isolation, branch scope and record ownership remain independent requirements: a permission grants an action, not unlimited access to records.

The audit inspected backend authorization infrastructure, all controller route declarations, permission resolution and caching, branch scope helpers, profile/staff administration, reports, visitors, messaging, appointments, and frontend permission controls. The mobile project is not initialized. Tests use local mocks; this is not a deployed penetration test or a production performance certification.

## Findings corrected

| Severity | Finding | Change |
|---|---|---|
| High | Visitor detail, edit, delete, archive, restore and conversion enforced church but omitted branch ownership. | Added request-context branch checks before returning data or writing. Assigned branch users retain the established shared legacy visitor policy. |
| High | Every authenticated account could change custom-field definitions and send WhatsApp messages. | Definition writes require `church_settings:update`; sending requires `whatsapp:create`; history requires `whatsapp:read`. |
| High | General profile editors could enable HQ scope. | HQ changes additionally require reserved `church_settings:update`, reject self scope changes, and record the old/new flag in audit logs. |
| High | WhatsApp webhook verification was bypassed when its secret or raw body was unavailable. | Reject these requests; require an exact-payload HMAC signature. Removed default verification token and token logging. |
| High | Revoked JWTs could become usable during a Redis outage. | Revocation lookup now fails closed with HTTP 503. |
| High | Profile and staff administrative operations could target other branches. | Added scope checks before administrative writes and scoped security-operation lookups. Legacy staff role changes require both role-management and reserved settings permission, validate role input, and prevent self/super-admin role replacement. |
| High | An invitation could grant more permissions than its caller or link to a branch in another church. | Profile invitations compare requested grants with the caller; both invitation paths validate branch ownership before provider calls and pin branch callers to their branch. |
| Medium | Missing tenant profiles or tenant mismatches could disable filters. | HTTP request contexts without a valid matching viewer are rejected by context scope helpers; background jobs without HTTP context retain explicit tenant-scoped operation. |
| Medium | Unassigned non-HQ users could receive church-wide reports or visitor lists and create shared visitors. | Unassigned reads use a no-match branch; branch writes require an assignment. |
| Medium | Role-derived church scope silently overrode an explicitly disabled HQ flag. | Middleware, profile responses, and appointments honor `is_admin_hq`. No-op administrator role updates preserve a disabled flag; first promotion still defaults HQ on. |
| Medium | Archived profiles and removed staff could retain session access. | Middleware rejects archived accounts; staff removal also sets inactive status and clears HQ scope. |
| Medium | Giving callbacks inherited a controller JWT guard although providers authenticate with signatures. | JWT guards now protect individual giving user endpoints; provider callbacks use their existing signature-verification path and exact raw body. |

## Authorization contract

- The global PermissionsGuard checks all declared grants and rejects missing identity. JWT guards still verify authentication, revocation and session assurance.
- Controller routes must carry a permission policy or appear in an explicit exception registry in `test/unit/auth/route-authorization.spec.ts`. The test also checks private-route JWT protection and prohibits legacy role guards.
- Exceptions cover public/signature-authenticated endpoints, personal account operations, own notifications/bookmarks, and routes using resource-specific permission/ownership decisions. An exception is not proof that every service path has been penetration-tested.
- HQ widens data scope within a church; it does not grant operations or church administration. A profile seated in an HQ branch does not automatically gain HQ access.
- Existing super-admin account protections and role-assignment rank limits remain. Role names also identify domain participants such as pastors. These are distinct from route role guards.
- `data_scope:church:read` remains in the legacy permission catalog for compatibility but no longer overrides the explicit profile HQ flag.
- Unassigned branch accounts receive no branch-owned data. Legacy visitors with no branch remain shared with assigned branch staff, matching the existing product policy; they are not exposed to unassigned branch accounts.

## Performance changes and limits

Removed redundant role guards and appointment permission resolution. Effective permission resolution deduplicates roles and short-circuits administrator unions to one cached catalog lookup. Message pagination is capped at 100 and invalid page/limit values fall back to bounded defaults. Existing tenant/viewer/permission/branch-sensitive response cache keys remain intact.

No representative production dataset, query-plan capture, concurrency benchmark, or live Redis/PostgreSQL failover test was run. Further tuning should use measured latency and query plans. Role grants remain cached for 15 minutes with invalidation on edits; an invalidation failure can leave a stale grant until expiry. A durable permission revision scheme is still needed for a strict immediate-revocation guarantee during cache failures.

## Deployment and verification

Deploy the backend and frontend together so HQ controls and API scope semantics agree. No schema migration or permission seed change is required. Configure `TERMII_WEBHOOK_SECRET` and `TERMII_WEBHOOK_VERIFY_TOKEN` for WhatsApp webhooks; unsigned/unconfigured webhooks will now be rejected. Redis availability is required for protected requests because revocation checks fail closed.

Validation commands: backend `npm test -- --runInBand --silent`, `npm run build`, scoped ESLint; frontend route permission tests, TypeScript check and scoped ESLint. Behavioral regressions cover missing identity, all-required grants, revoked tokens/cache outages, tenant mismatch, missing branches, cross-branch visitor operations, HQ grant restrictions/self elevation/auditing, signed webhooks, and API policy coverage. Completed: 65 backend suites / 1,209 tests; 239 frontend route-permission tests; backend production build; frontend TypeScript check; scoped backend/frontend ESLint.

Production deployment, database-backed adversarial tests, a complete dependency/infrastructure audit, and load testing remain outside the evidence gathered here. No live configuration or production data was changed.
