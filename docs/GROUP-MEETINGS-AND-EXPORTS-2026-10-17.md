# Group meetings, ownership and exports — 2026-10-17

## Access rules

All API endpoints continue to use permissions. HQ changes church-wide read scope within the same tenant; it does not confer ownership of every group/department.

| Operation | Branch cell leader/head | HQ cell leader/head |
|---|---|---|
| Read groups/departments | Own groups/departments, with branch restrictions | Church-wide |
| Record cell-group giving | Groups they lead only | Groups they lead only |
| Record meeting attendance | Own groups/departments only | Own groups/departments only |
| Create a cell group/department | Not through own-scope leader/head grants | Allowed with the corresponding permissions |
| Export readable data | Allowed | Allowed within the same church |

Department creation is derived centrally from `departments:own:update` plus the authenticated profile's HQ flag. The derivation happens after role-cache resolution, so an HQ grant is never cached as another person's role default. Both `/profiles/me` and the API middleware use it. Church admins and super admins retain their normal full grants. Other staff retain their existing permission-based write scope.

Both the dedicated group-giving endpoint and manual giving with a group ID enforce ownership. The UI uses the same own-scope grants and linked member ID. Creating a group validates its branch and leader assignments in the church. Attendance writes validate parent access, own-department ownership, department membership/branch, status and date before persisting.

## Meeting attendance

Cell-group attendance now offers meeting-date, status and attendee/notes search filters and CSV, Excel and PDF exports of the filtered records.

Open a department's detail drawer to see its meeting-attendance table. Authorized managers can record department members or named visitors with date, status and notes. A member has one attendance row per department and date; saving again updates that row, including concurrent saves. Read-only viewers can filter and export without a create/update permission. Members may only be selected from that department's membership.

## Export coverage and limits

Existing list exports remain available, including full matching-list exports where already supported. Department and cell-group list export buttons now follow read grants even for branch leaders/heads.

Every shared table offers **Export visible rows**, including tables inside drawers/dialogs. The dashboard's **Export visible data** exports the current page's rendered tables, semantic lists and annotated data/card/calendar collections. CSV includes collection names; Excel/PDF preserve separate sections. Department-member lists have their own export control.

These shared exports intentionally contain **currently visible, loaded rows** with current filters and column visibility. They do not include other pages, closed dialogs/tabs, hidden rows, form input values or records from a query cache. The labels distinguish this from existing full-list export buttons. Exporting makes no additional API requests and needs only the read access that rendered the data. Collection scanning and PDF/Excel code loading happen only when requested. Existing CSV formula escaping is reused.

## Deployment

Apply `20261017190000_department_meeting_attendance` to the backend database and deploy backend/frontend together. The backend console's migration option performs a verified backup before applying migrations. No new permission seed is required for these changes; the existing department/cell-group grants remain in use.

The migration adds indexed `department_attendance` rows, parent/member foreign keys, a unique member/date constraint, status/attendee checks and RLS with no direct anon/authenticated browser access. API reads and writes are scoped through the department. No deployed church data has been modified by this work.

## Validation

Backend unit regressions cover HQ permission derivation, both group-giving paths, own-department write checks, parent read checks, invalid dates and membership validation. Disposable PostgreSQL tests cover migration application, concurrency/idempotency, visitors, date filters, HQ/branch/tenant isolation, creation assignment validation and database attendee checks. Browser fixtures cover the buttons, attendance recording/filtering, read-only CSV export and visible-data boundaries. See the test files under `test/unit/admin`, `test/e2e/department-attendance.e2e-spec.ts`, and the web `test/browser/group-meetings.e2e.ts` / `cell-group-giving.e2e.ts`.

Final local verification: **1,393 backend unit tests**, **312 frontend unit tests**, **11 PostgreSQL regressions**, and **22 Chromium workflows** passed. Both production builds, scoped lint and TypeScript checks passed. All 54 migrations applied to the disposable database; its container and volume were removed. Live migrations/deployments were not performed.
