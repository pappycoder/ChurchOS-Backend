# Usher event management — 2026-10-18

Ushers have event create/read/update/delete grants, with derived calendar/list/registration/check-in/ticket permissions and explicit issued-ticket-record reading. This enables event editing, archive/restore, deletion subject to existing history protections, registration status updates and ticket-type/ticket management. These are canonical permission-template grants; no role checks were added to UI controls or API guards.

Branch ushers remain restricted to their assigned branch; HQ ushers retain church-wide visibility. No data-scope grants or church settings permissions were added.

Apply `20261018200000_usher_event_management` and deploy the backend. The migration adds event grants only to global usher templates, preserving existing grants, church overrides and church-owned custom roles. Cache namespace v24 prevents stale permission arrays being reused. Refresh the usher session after rollout. Frontend runtime already consumes these permissions; frontend changes here are local browser fixtures/tests only.

Verified locally: 147 targeted backend unit tests across eight suites, six usher browser workflows, frontend TypeScript and scoped lint checks passed. PostgreSQL migration checks confirmed all 30 event grants, repeat-application idempotency and preservation of unrelated/custom roles and existing grants. No live data or deployment was changed.
