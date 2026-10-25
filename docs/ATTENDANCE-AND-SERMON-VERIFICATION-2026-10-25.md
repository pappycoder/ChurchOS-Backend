# Attendance identity and sermon recording verification — 25 October 2026

Registration reserves a member's place in an event. A free registration generates a zero-price ticket/code immediately; paid registration waits for payment confirmation. Attendance is a separate operation and supports unregistered members and walk-ins. Community includes free-event registration and attendance; paid ticket management remains on Network.

## Attendance rules

- One member or linked visitor check-in per event, across every date and entry method.
- One member or linked visitor check-in per recurring service per selected attendance date. A different service or date is a different meeting.
- PostgreSQL unique indexes enforce the rules when requests race. Single-record endpoints return a conflict; roster batches count duplicates as skipped.
- Name-only visitor entries use a case- and whitespace-normalized name within the same event/service date. Names cannot establish identity across aliases. Distinct people sharing a name should use distinct visitor records.
- Event walk-ins normalize phone formatting for lookup and take a transaction-scoped lock for that church/phone while locating or creating a member. Attendance and registration updates commit together. Existing phone-based identification still means a shared household phone alone is not a reliable identifier for different people; use their individual saved member records.
- Ticket validation atomically claims an unused paid ticket and writes the same attendance identity as the roster. Duplicate attendance rolls back the claim. Pending/cancelled/refunded tickets cannot be consumed. Older registrations already marked checked in are also skipped by the event roster.

## Sermon recording handling

Uploaded bytes remain in managed storage with a media-library asset; the returned URL is saved on the sermon. Pasted links are saved in the same audio/video URL fields and are not copied into storage or automatically added as library uploads. HTTP/HTTPS URLs are validated; unsafe or malformed links are rejected.

The form has Details, Audio and Video sections with separate Save Details, Save Audio and Save Video actions. New sermons save details first, then open the saved sermon's editor so recordings can be added independently. Each request contains only that section's fields. Audio/video saves bypass metadata validation, upload only the chosen recording and persist only its URL; a failed upload or PATCH leaves saved details and the other recording intact. Drafts persist across tabs and background refetches. A successful upload is retained locally for retrying a failed PATCH without reuploading. Uploads use the saved branch, while an unsaved branch draft stays in Details. All inputs are locked during a save. Clearing a recording sends explicit null; removing a reference does not delete the library file.

File URLs and external URLs were round-tripped through a disposable PostgreSQL database. Browser coverage verifies uploaded audio loading, audio/video controls, read-only library access, pasted links, Vimeo embeds, URL rejection and clearing. Private file streaming/range handling was covered by the preceding media tests; no production storage upload was performed here.

## Deployment

Apply `20261025150000_attendance_duplicate_guards`, regenerate Prisma and deploy API/web together. Do not drop or merge historical records automatically. This migration is transactional and refuses to add an index if historical duplicates already violate it. Reconcile any such rows deliberately before retrying the migration using the normal migration recovery procedure.

Read-only preflight for linked visitor duplicates:

```sql
SELECT event_id, visitor_id, count(*)
FROM attendance WHERE event_id IS NOT NULL AND visitor_id IS NOT NULL
GROUP BY event_id, visitor_id HAVING count(*) > 1;

SELECT service_id, visitor_id, attendance_date, count(*)
FROM attendance WHERE service_id IS NOT NULL AND visitor_id IS NOT NULL
GROUP BY service_id, visitor_id, attendance_date HAVING count(*) > 1;

SELECT church_id, service_id, event_id,
       CASE WHEN event_id IS NULL THEN attendance_date END AS service_date,
       lower(regexp_replace(btrim(visitor_name), '[[:space:]]+', ' ', 'g')) AS normalized_name,
       count(*)
FROM attendance
WHERE member_id IS NULL AND visitor_id IS NULL
  AND visitor_name IS NOT NULL AND btrim(visitor_name) <> ''
GROUP BY church_id, service_id, event_id,
         CASE WHEN event_id IS NULL THEN attendance_date END,
         lower(regexp_replace(btrim(visitor_name), '[[:space:]]+', ' ', 'g'))
HAVING count(*) > 1;
```

## Configured database observation

A transaction explicitly opened READ ONLY against the database configured in the backend `.env` found one sermon, no saved audio/video references, no assets in the `sermons` folder, and no linked-visitor duplicate groups. No names, URLs or credentials were printed. This is not proof that a separately configured live deployment points to the same database, nor proof that previously attempted uploads succeeded. After the user identified Walking in Faith, a second read-only check found that exact sermon once, with neither recording URL, no audio/video library assets in its church, and no sermon-path objects in Supabase storage for its church. The configured database is remote; its equivalence to the deployment environment has not independently been proven. No existing recording could be recovered or verified as attached from these results. No production data was changed and the new migration was applied only to a disposable local test database.

Validation: 129 API unit tests, 27 PostgreSQL concurrency/session/headcount checks, 16 web unit checks and four sermon browser flows passed, alongside both production builds and targeted lint. Two existing attendance integration fixtures now provision Network subscriptions so their multiple-branch/group tests exercise attendance under the current plan constraints.

The subsequent three-section web form refactor passed 25 web unit checks, eight media/editor browser flows and six sermon branch regression checks, including creation, editing only details, link removal and retries after upload/save failures. The web production build, TypeScript and targeted lint passed. This UI follow-up uses the existing API and needs only web deployment; it does not apply the attendance migration described above.


The independent-section save follow-up passed 25 web unit checks, nine media/editor browser flows and six sermon branch regressions, plus TypeScript, targeted lint and the production build. Browser cases verify isolated request payloads, saved details before media on creation, upload and PATCH failure retries, recording removal, retained drafts, and saved-branch upload routing with an unsaved HQ branch selection. These browser requests used mocked APIs; no live sermon or storage writes were made. Deploy the web application for this UI change.
