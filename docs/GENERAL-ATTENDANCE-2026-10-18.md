# Shared attendance sessions and mixed services

A single `AttendanceSession` model holds reported meeting totals for services, events, departments and cell groups. Each session belongs to exactly one meeting context, one church, one branch and one calendar date. Typed foreign keys and a database CHECK constraint enforce the context; unique indexes prevent duplicate totals for the same meeting/branch/date.

The existing individual `Attendance`, `DepartmentAttendance` and `CellGroupAttendance` models now have nullable `session_id` foreign keys. Their status, member/visitor, notes and historical records remain intact. Counts live once on the session, not repeatedly on individual rows. Named attendees are optional details: a total-only session needs no member/visitor entries. Existing individual check-in workflows remain available independently.

## Recording and reporting

Use **Record general attendance** on the service, event, department or cell-group detail page. On the service or event Check-In page, select the meeting first. Enter the meeting date and required total; adults, children, male and female are optional. Blank is stored as null; zero is a reported zero. Counts must be non-negative whole numbers. The known adult+children subtotal and the known male+female subtotal must each be <= total; either may be incomplete. Age and gender are overlapping classifications and are never added together.

Named details recorded before a session are attached when the total is recorded. New details in a determinable branch attach to an existing session by meeting/date. Shared HQ meetings whose branch cannot be determined leave the optional detail link empty; no branch is guessed. Adding named details never inflates or overwrites a reported total. Cell-group averages prefer reported totals for a date and use named present/late counts for other dates, preserving absent-only meetings as zero.

Services can be Adult, Children or Mixed (Adults & Children). Individual check-ins remain Adult, Children or Unspecified. Mixed services default individual check-ins to Unspecified rather than automatically classifying everyone as adults.

Tables have pagination, date and branch filters and read-based exports. Filtered exports use the shared 5,000-row ceiling. Reports display reported service totals separately from named check-ins; they never sum both populations. Department, cell-group and event totals remain in their own context with their existing independent read grants. A create-only user does not need a read grant to record totals. Duplicate creation returns 409; counts corrections use an independent update grant and cannot reassign the session context/date/branch. Archive meeting contexts with attendance history rather than deleting them.

## Authorization

All guards use permissions, not role names:

| Context | Read/export | Record totals | Correct totals |
| --- | --- | --- | --- |
| Service | `attendance:records:read` | `attendance:checkin:create` | `attendance:records:update` |
| Event | `events:checkin:read` | `events:checkin:create` | `events:checkin:update` |
| Department | `departments:read` | `departments:update` | `departments:update` |
| Cell group | `cell_groups:details:read` | `cell_groups:create` | `cell_groups:update` |

Service summary endpoints retain `attendance:reports:read`; the attendance dashboard and report generator retain their own aggregate read grants. Per-service named breakdowns retain their independent `attendance:services:read` grant.

Branch users are pinned to their branch regardless of requested branch filters. HQ widens reading within the church; own-update grants continue restricting department heads and cell leaders to the meetings they lead on every write. Parent visibility is checked before reading, creating or editing sessions; a context-specific route cannot update a session from another meeting. RLS and revoked browser-role grants protect the session table from direct browser access.

## Migrations and deployment

Apply all three migrations before deploying the updated backend and frontend:

1. `20261018120000_mixed_services_general_attendance` adds mixed service categories and the initial service totals storage.
2. `20261018160000_shared_attendance_sessions` renames that storage to `attendance_sessions`, preserves its records, adds event/department/cell-group contexts and optional links from existing individual attendance tables, and safely links earlier service details.
3. `20261018170000_service_attendance_dates` backfills a calendar date from existing check-in timestamps, scopes member uniqueness to each recurring service date, and removes the older duplicate-prevention trigger that blocked later occurrences. Existing records are retained. Named check-in occurrence dates follow the backend UTC calendar; meeting totals use the explicit date entered.

This task does not migrate or modify deployed church data. The full migration chain is tested against an isolated local PostgreSQL database. A schema comparison confirms the attendance tables match the intended model; unrelated pre-existing drift in older tables is outside this change.

## Verification

Unit coverage checks count combinations, nullable values, permission metadata, tenant/branch predicates, HQ ownership, cross-context corrections and mixed-service defaults. PostgreSQL coverage exercises duplicate/concurrent creation, partial persistence, total-only sessions across all four contexts, optional detail links before/after session creation, ownership restrictions, context/numeric database constraints and RLS. Browser fixtures cover forms, validation, read-only exports, contextual grants without unrelated attendance permissions, ownership controls, mixed-service selection and report exports. No live provider or business-data mutations are used.

Verification also covers a member attending a later recurring service occurrence while duplicate check-ins on the same date remain blocked. Migration tests preserve earlier headcounts and optional detail links.

Final checks: backend production build and all 1,426 unit tests passed; frontend production build and all 297 unit tests passed. Isolated PostgreSQL ran all 57 migrations and passed 21 attendance/upgrade/trigger checks. The 35 existing browser workflows passed; the nine shared-session workflows passed after correcting fixture permission and response-shape assumptions. UI contract audit reported no issues. No production data or deployments were changed.
