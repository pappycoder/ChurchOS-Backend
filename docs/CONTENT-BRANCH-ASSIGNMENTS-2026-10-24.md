# Branch assignment for events, sermons, templates, broadcasts and forms

All five areas support branch selection during creation, branch changes during editing, saved branch names in details and branch filters in their lists. Events also support branch selection in calendar quick add, branch display in its detail dialog and branch filtering on the calendar, including its service schedule. Existing sermon, template and form filters are retained; missing event and broadcast filters are added. Summary queries follow the selected branch.

| Area | Create | Update | Details | Filter |
| --- | --- | --- | --- | --- |
| Events | Full form and calendar quick add | Edit Event | Detail page and calendar dialog | All Events and calendar |
| Sermons | New Sermon | Edit Sermon | Sermon details | Sermon list |
| Message templates | Add Template | Edit Template | Detail dialog | Template list |
| Broadcasts | New Broadcast | Edit Branch in future scheduled broadcast details | Detail dialog | Broadcast list |
| Forms | New Form | Edit Form | Form details | Form list |

HQ viewers choose an active church-owned branch. Creation defaults to their assigned branch or the sole active option. Branch-scoped staff see their fixed branch and creation sends that assignment. Unchanged edits omit `branchId`, preserving legacy church-wide records and unavailable/archived current assignments. Legacy records with no branch display “Church-wide.” Existing list visibility for shared records is preserved.

The API validates destinations against `church_id` and `archived_at: null` and rejects cross-branch staff assignments. Sermon and template update DTOs now accept branch IDs; form updates now persist them. Responses include `branchId` and `branchName`, with relation reads for content and a batched name lookup for broadcasts. Foreign or archived branches cannot be assigned. Branch changes are audit logged.

Broadcast ownership continues to use the existing `audience_filter.branchId`; no separate branch column or migration is added. Top-level create `branchId` and the recipient filter are resolved to the same branch. Available templates must be shared or belong to that branch. Changing the create branch clears the selected template. `PATCH /broadcasts/:broadcastId` requires `broadcasts:update` and accepts a required UUID `branchId`. Only broadcasts with a future scheduled send can change branch. The API rechecks template availability, recalculates matching recipients and replaces the saved recipient rows and total in one transaction. A conditional scheduled-state update fences changes against the worker's sending-state update. Already sending, sent, failed, canceled, unscheduled or due messages cannot be reassigned; branch edits never queue another message. An empty audience or unavailable destination template leaves the broadcast unchanged.

Browser verification also found required dropdown values clearing on initial hydration in Event Type and form Status. Empty native-select change events now leave those saved choices intact; template required selects and branch selection likewise retain their values.

Validation: **224 targeted API tests** and **23 local browser checks** using mocked APIs passed, along with TypeScript, targeted ESLint and both production builds. These checks do not send live messages or change production records.

Deploy API and web together. No database migration or permission seed is required.
