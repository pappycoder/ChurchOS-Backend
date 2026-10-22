# Roster dates and Essentials giving recording

Service and event roster check-in panels now have an Attendance Date field, defaulting to today's local calendar date. A blank date disables marking attendance; changing the date clears member selections. The field locks during the whole batched submission so each batch and retry targets the chosen day. Existing department/cell-group meeting date controls already provide date selection.

The service bulk and event bulk check-in APIs accept optional `attendanceDate` as a real YYYY-MM-DD calendar date. DTO and service-level validation reject impossible days, timestamps and malformed values. Explicit dates populate attendance_date and a midnight UTC checkin_at so existing check-in-based reports/trends reflect that selected day; created_at retains the actual recording instant. Session linking uses the selected day. Service duplicates are checked for that day, allowing another occurrence on another date; the existing event member uniqueness rule remains. Event registration check-in timestamps and audit metadata also use the chosen day. Older clients omitting a date preserve current-instant behavior.

Opening Record Giving previously fetched the Community Events list even on Essentials, triggering the global upgrade dialog. The form now only loads/shows event links with effective event-list access. The shared event-list hook also requires that access, preventing other unguarded consumers from issuing the same request. Cash/bank gifts, general/member/service links and giving-plan enforcement retain their current permissions and scope. No paid feature was unlocked.

Validation covers strict dates and DTO inheritance, recorded dates, duplicate service occurrences, matching session links and event registrations. Browser coverage checks selected dates across 200-record batches, partial retries and date changes, plus successful cash/bank giving on Essentials without event API requests. Browser APIs are mocked; no real gifts or attendance were submitted.

Verified: focused backend and frontend tests, backend TypeScript checks, targeted lint, the production web build and all 20 roster/plan browser scenarios passed.

Deploy API and web together for roster dates. No new database migration is required. The existing Essentials-giving migration must already be present on the target database. No production migration or deployment was performed.
