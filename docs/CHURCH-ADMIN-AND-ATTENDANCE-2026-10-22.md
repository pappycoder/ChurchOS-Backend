# Church administration and Essentials attendance — 2026-10-22

Church Admins can invite any church staff role, including Senior Pastor, Church Admin and custom roles belonging to their church. The main invitation flow previously compared the requested role's full permission set against the administrator's plan-filtered set. That rejected legitimate invitations on smaller plans. Administrators now bypass this subset comparison; other delegated inviters retain it. Role assignment does not unlock plan features. Staff seat reservations/limits, duplicate-email detection and church/branch scope checks remain in place.

Both invitation APIs validate role existence within the church/global staff templates before contacting Supabase. Their DTOs permit church-owned custom roles and reject Super Admin and the retired Member login role. Supabase invitation delivery is mocked in regression tests; no live invitations were sent.

The church role summary excludes Super Admin and returns Church Admin first. Direct church role permission reads for Super Admin return 404. The frontend also filters stale Super Admin/Member catalog entries from role management and assignment options, and keeps Church Admin first. Internal platform permission resolution and existing account roles are preserved.

The attendance dashboard previously fetched events unconditionally. Essentials correctly rejects that paid-module request, which triggers the global plan upgrade dialog even though service attendance itself is included. The optional events panel and query now require effective event-list access; its branch filter also follows the dashboard selection. Core summary, trends and individual attendance queries keep their independent attendance permissions. Advanced analytics and event attendance retain their existing plan requirements.

Validation covers administrator invitations on a restricted plan, custom roles, invalid/foreign/platform roles, DTO validation, delegated inviter and branch safeguards, church role summaries and ordering, and the core attendance endpoints under the Essentials plan guard. Browser regressions cover Essentials Church Admin/Branch Pastor attendance without paid-module requests, plus role-table and invitation-option ordering/visibility.

Verified: 261 focused backend tests, 11 frontend tests, all 9 browser scenarios (the invitation scenario passed on rerun after correcting a missing read permission in its fixture), backend/web TypeScript checks, targeted ESLint and the production web build.

Deploy backend and web together. No schema migration or seed change is required for these fixes. No production deployment or database changes were performed.
