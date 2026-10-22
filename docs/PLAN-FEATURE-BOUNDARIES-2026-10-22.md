# Plan feature boundaries — 22 October 2026

## Plan allocation

| Plan | Members / staff / locations | Features |
| --- | --- | --- |
| Essentials | 100 / 2 / 1 | Member, family and visitor directory; visitor follow-up; services and service attendance; staff permissions; giving categories, cash/bank/online giving, downloadable receipts, basic totals and administrator payment-provider setup; church/account settings; internal staff inbox; help and billing. |
| Community | 300 / 5 / 1 | Essentials plus events and registrations, departments/cell groups, forms, reports, email communication/provider setup, sermons and media library. |
| Network | 1,500 / 15 / 3 | Community plus event ticket management/check-in, pastoral care/appointments, assets, administrator analytics, SMS, WhatsApp, live calls and outbound webhooks. |
| Enterprise | Explicit agreed capacities | All Network features with agreed rollout/support arrangements. No automatic unlimited capacity. |

Feature eligibility never substitutes for a staff permission, administrator-only restriction, branch scope or record ownership. Role grants and HQ status cannot unlock a paid module. Essentials and Community retain one location; location increases continue to use the existing database quota protections.

## Corrected gaps

The old server guard bypassed almost every GET/HEAD/DELETE and broadly bypassed action suffixes such as verify/archive. The web allowed missing plan data, retained read/view/delete grants for excluded modules, and offered a historical-record button that opened the entire module. Departments used a UI URL absent from the plan map; navigation plan filtering stopped at parent items. Tickets/check-in were mapped to basic events. Shared provider setup could create/configure Network channels on Community even though delivery itself was guarded.

The guard now checks paid reads, exports, mutations and deletes using both the API route and required permission metadata. Only payment verification and pausing/cancelling an existing recurring gift have narrow authenticated exceptions. Signed provider callbacks and settlement logic remain unchanged. Profile responses and controller request scopes remove excluded module grants, so generic sync/offline endpoints cannot hydrate paid collections with broad role permissions. Event attendance is excluded from generic service-attendance reads and sync when the requester lacks event check-in access. Explicit event attendance writes through the shared endpoint require Network.

Paid-event creation and changing a free event to paid also require Network in the API and database. Public form metadata/submissions recheck the owning church’s eligibility after downgrade. Member giving history now requires its giving grant and plan; the member page does not fetch/render that section without access. Private library downloads recheck the plan even for the uploader. Shared upload handlers select the feature by purpose, retaining profile/church/branch branding on Essentials. Integration lists expose only eligible providers/channels; creation, verification, configuration and use recheck the provider/channel feature. Community templates/broadcasts default to email and hide unavailable channel choices. Webhook notifications/queued deliveries stop when the church lacks an active eligible plan.

Downgrades preserve stored records. Premium modules become accessible again on an eligible active plan; there is no general historical-read bypass. This policy supersedes the historical-read behavior described in the 19 October entitlement rollout notes. The assistant's generated route map and guidance reflect the new rules.

## Rollout and verification

Apply `20261022140000_plan_feature_boundaries` followed by `20261022160000_essentials_giving` and deploy API, persistent worker and web together. This aligns SQL eligibility with media and webhooks and protects new media/sermon/webhook records; it does not remove existing records or change plan prices/capacities. Existing permissions catalog/role assignments need no reseed. Runtime checks use the subscription record, independent of cached role permissions.

Verification includes a four-plan API method/route matrix (including super administrator/HQ), metadata-based composite checks, server/client feature and full permission-catalog parity, fail-closed frontend grants/page rendering, recursive menu filtering, channel configuration and post-downgrade webhook/media behavior. Isolated PostgreSQL tests apply the repository migration chain and verify the SQL catalog, branded upload exceptions, feature persistence and existing quota/settlement behavior. Browser fixtures exercise Essentials direct routes, Community ticket/check-in segregation and missing entitlement data without live provider calls.

Final checks passed: the relevant backend unit suites (including the four-plan route/method matrix), all 383 frontend unit tests, 14 PostgreSQL feature/capacity regressions in a fresh isolated database, four browser regressions against the production build, targeted lint, assistant catalog freshness, and both production builds.

No production migration, deployment, subscription change, payment or outgoing provider delivery was performed for this change.


## Essentials giving revision

Giving is included in Essentials and every higher active plan. The server and SQL catalog both enforce this. Essentials administrators can open Integrations and manage payment accounts; the integration response exposes only Paystack/Flutterwave and the payment channel for that plan. Email delivery remains Community, and SMS/WhatsApp/advanced analytics remain Network. Receipt PDFs and basic giving totals are available on Essentials; sending receipts through external channels follows those channels’ tiers. Group meeting giving still requires Community’s groups feature. Staff permissions, church isolation, shared category uniqueness and subscription expiry checks remain in force. Prices and capacities are unchanged.

The additive `20261022160000_essentials_giving` migration updates the existing SQL feature function; it does not alter tables or records. No production migration, deployment or subscription mutation was performed for this revision.


Revision verification passed: 428 relevant backend unit tests, all 385 frontend unit tests, 15 isolated PostgreSQL entitlement/persistence tests and six browser regressions. Both production builds, TypeScript checks, targeted lint and assistant catalog freshness checks passed. The browser checks cover Essentials giving pages, payment-only administrator setup and retained higher-plan restrictions.
