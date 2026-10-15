# Read-only UI verification — 15 October 2026

## What this pass found and fixed

Previous role/permission checks were not enough to establish that every read-only workflow worked. A permission code can exist and still be checked in the wrong place. This pass traced page entry, action controls and supporting requests and corrected confirmed failures.

- Asset list/category actions, attendance service/check-in/record actions, form list/submission actions, media actions, giving recording, member management, pastoral notes/life events and visitor actions now use the corresponding API surface permission rather than an unrelated coarse CRUD permission.
- Asset loan creation and return use separate `assets:loans:create` and `assets:loans:update` grants; maintenance scheduling uses its create grant. A list-only asset reader does not fetch or see maintenance/loan tabs without those read grants. Viewing the asset and its QR/depreciation data does not require creating it.
- Reference categories, attendance services, media folders and form submissions are fetched only with their respective read grants. Authorized reference reads require no create/update/delete grants. Optional filters without their supporting read permission are omitted; optional sections do not prevent the main page from loading.
- The Giving dashboard previously called transaction-record APIs. This blocked the default secretary's intended dashboard-only access. New `GET /giving/dashboard` uses `giving:dashboard:read` and returns aggregates/monthly count, without individual transaction records. Its query DTO accepts only a branch filter, preventing donor-specific probing. Individual records remain behind `giving:records:read`. The UI does not request or render recent gifts without that separate grant. Aggregate queries run concurrently.
- Attendance totals, records and trends are independently gated. Dashboard viewing does not require check-in creation or access to individual records/reports.
- The visitor follow-up board is viewable with visitor-list read permission; dragging/status changes require list update. Visitor conversion uses follow-up update independently of list editing; archive/restore use list update, and deletion uses list delete. These controls are checked independently on both list and detail views.
- Sidebar leaf permissions match page route permissions, including granular asset, form, media, pastoral, sermon and visitor read grants. Parent menus derive visibility from authorized children.
- Report readers can enter Reports with an individual report-read grant, without needing unrelated view/write grants. Navigation and route checks accept those alternatives. Ticket tier viewing uses ticket read, while tier mutation buttons use ticket create/update/delete grants.
- Form cloning follows the API's list-update requirement; reviewing submissions requires submission-update rather than permission to edit the form definition. Reading a form does not automatically request submissions.
- Member pickers fetch when opened and include the selected branch in search queries. HQ searches apply the branch filter before limiting results, avoiding empty or incomplete pickers caused by filtering another branch's limited results in the browser. Branch callers cannot override their own branch.

## Evidence and limits

Unit regressions check independent read-only queries, aggregate/dashboard versus record access, donor-query rejection, branch-aware picker behavior, read-only route alternatives and all existing role/scope contracts. The cross-project catalog audit reports zero unknown permission references after these changes. Validation passed: 1,269 backend tests across 67 suites, 294 frontend tests across seven suites, production builds for both applications, frontend type checks and scoped lint. The catalog audit checked 383 permission definitions and 620 source references with zero issues.

All three browser regressions passed: branch and HQ aggregate-only Giving readers, and an asset-list-only reader opening details without write, maintenance or loan access. They run against the real production frontend with mocked API responses; they cannot certify the live backend or stored role assignments. The permitted run used localhost networking after the default sandbox blocked startup.

This work does not grant read access implicitly from a write grant or silently add permissions to custom roles. A form needing a supporting lookup must have that lookup's explicit read capability; unavailable optional lookups are not treated as required page failures. Seeded presets and arbitrary church-specific custom configurations are different verification targets.

Full verification of every button, every role combination, uploaded attachments, exports, bulk/offline paths and live church overrides still requires database-backed end-to-end testing. The earlier database audit could not connect/complete. No live role grants or database data were modified, and these changes are not deployed. Deploy backend and frontend together because the Giving dashboard now uses its dedicated aggregate endpoint.
