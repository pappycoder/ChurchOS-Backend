# Attendance rosters and collection controls — 2026-10-18

Services and events use one shared searchable attendance roster. Department and cell-group attendance dialogs use that same roster UI, restricted to the department/group membership list. Visitor attendance and general headcount forms remain available independently; reported headcounts are not overwritten by named attendance.

Select individual members or Select visible, search without losing selections, and load additional pages. Church rosters request 100 members per page and narrow to the selected meeting branch. Saving submits at most 200 members per request. Successful batches clear their selections; failed and unsubmitted members remain selected for retry. Meeting/date controls are locked while a save runs.

Department/group bulk endpoints use the same permissions as their existing attendance actions: departments:update and cell_groups:create, respectively. Parent visibility and archive checks, own-leader write restrictions (including HQ), church/branch membership and membership in the parent roster are checked before writes. Each batch uses a transaction with createMany(skipDuplicates) and updateMany, giving two set-based writes regardless of roster size. Re-recording the same member/date corrects the existing status/notes; no duplicate attendance rows are created. A batch is atomic; multiple batches are not one transaction, and the UI reports partial completion honestly.

List/table searches, filters and exports sit inside the collection card. Export-all continues to use that collection's current server filters. Visible-list exports resolve their nearest collection instead of reading the whole page. Dashboard and analytics summaries have no export controls; dedicated record/report collections retain exports.

Deploy backend and frontend together. No schema migration is introduced by this change. Prior attendance/usher migrations still apply if they are pending.

Verification completed locally:

- Backend: 81 unit suites, 1,439 tests passed.
- Frontend: 11 unit files, 297 tests passed.
- PostgreSQL: 10 shared-attendance integration checks passed, including bulk department/group persistence, duplicate correction and rejection before writes.
- Browser: 54 distinct workflows verified. The initial run passed 53; one fixture still placed export data outside its collection. After updating that fixture to the new collection boundary, the remaining workflow passed separately, including exclusion of neighboring lists.
- Backend and frontend production builds, final TypeScript check, scoped lint, UI contract audit and git diff whitespace checks passed.
- Database verification used only the disposable local test database; its PostgreSQL process was stopped afterward. No deployed data was changed.
