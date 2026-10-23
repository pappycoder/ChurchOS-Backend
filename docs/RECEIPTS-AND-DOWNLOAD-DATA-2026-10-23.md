# Receipt and download data audit

## Corrected receipt data

The PDF now receives actual saved transaction fields: amount/currency, giving date, recording timestamp, receipt number, payment method, payment-provider reference, transaction ID, notes, branch name and linked member/service/event/cell-group context. Member contact lookups are tenant-scoped; existing transaction branch visibility and successful-payment checks remain enforced.

Giving dates render as date-only values matching the stored business date. Recorded timestamps render separately in Africa/Lagos with timezone. Cash/bank writes now save `payment_method`; older records fall back to their recorded transaction type. Group/service/event collections show their source rather than being mislabeled as an anonymous donor. A missing receipt number is displayed honestly as not assigned. Downloads use safe filenames with slashes and other unsafe characters replaced.

Removed a random reference printed as if it could verify a receipt. No verification service existed for it. The real receipt number, payment reference and transaction ID identify the saved record. Normal detailed receipts fit one A4 page; longer content can paginate with branded headers/footers. A generated sample was inspected through PDF text extraction and image rendering.

## Export completeness and field coverage

The shared `fetchAllPages` helper previously stopped after 100 rows when callers requested 100 but its default assumed 200. It now uses the endpoint total or continues until an empty final page. Failed/malformed/repeated/prematurely empty pages abort instead of producing a partial download. Results above 5,000 require narrower filters instead of silent truncation; Giving Reports keeps its date filters available while showing that error. The shared export dropdown no longer substitutes the visible page after a full-export failure or empty result.

These shared changes cover paginated member, visitor, family, attendance and giving exports. Their existing branch/filter parameters remain intact. Giving list sorting includes stable creation-time/ID ties to avoid ambiguous ordering of records on the same giving date.

Giving Records and Giving Reports share one export mapper, including names/source, branch, giving date, recorded UTC timestamp, linked record/group meeting date, category, amount/currency, actual payment method/provider, status, receipt number, payment reference, transaction ID and notes. Explicit table export-key mappings retain these fields while respecting hidden columns. Visible-page/selected-row export remains explicitly distinct from fetching all filtered records.

The shared member picker remembers the chosen name and never falls back to rendering a UUID. This corrects Record Giving and other callers that omit a selected-name prop.

## Report boundaries and currency

Financial reports are explicitly per currency (NGN by default); the currency filter applies to aggregate, category and monthly queries and is displayed in preview/export labels. Giving Reports selects one actual currency from its fetched records for totals, charts and downloads. No currencies are added together as if interchangeable. Financial averages retain two decimal places. Month labels include years. Date-only report end dates include the full final day for financial, attendance and member reports.

## Receipt delivery findings

Email provider failures now propagate instead of recording a false sent notification. Receipt emails carry the generated PDF buffer and safe filename; dynamic email text is escaped.

The old WhatsApp receipt path sent only text naming a file, without uploading or attaching the PDF. Its option is hidden and API requests return an explicit unavailable error. PDF download and email attachments remain supported. Implementing real WhatsApp document/media delivery is separate work; the existing messaging code is retained.

## Validation and rollout

Targeted backend tests cover field propagation, tenant-scoped recipient lookup, unsupported WhatsApp delivery, email failure and report currency/end-day filters. Client tests cover complete and failed pagination, large-result limits and giving field mapping. Browser checks inspect actual downloads and member-name display. Existing CSV/Excel/PDF branding checks cover uploaded, missing and broken optional logos.

Deploy API/web together. No new migration or financial-data rewrite is needed. No live giving, provider email/WhatsApp send or production deployment was performed. Scope is the receipt path, shared download pipeline, giving export fields and report boundaries/currency; this is not a manual inspection of every historical record in every module.

Validation results: 196 backend checks, 11 client export checks, eight browser checks (including real CSV/Excel/PDF downloads), and two isolated database integration checks passed. Backend/web builds and type checks passed. A generated sample PDF was extracted/rendered and reviewed as one A4 page.
