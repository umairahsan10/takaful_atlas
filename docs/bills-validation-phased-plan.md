# Bills Validation Phased Plan

Owner: Aliyan + Copilot
Date: 2026-04-07
Mode: Phased implementation, one phase at a time
Persistence for bills: Disabled (no DB writes)
Acceptance target: Works on all 4 sample bills

## Objectives

1. Accept a bills PDF upload from the user.
2. Extract structured bill data from all pages using Qwen via image inputs.
3. Validate extracted line items against the existing hospital rate list in database.
4. Return reviewable results in UI with exceptions and manual remap/revalidate.
5. Export output as JSON/CSV (without persisting extracted bill payloads).

## Ground Rules

1. Implement one phase at a time.
2. After each phase, update this file before starting the next phase.
3. No bill extraction/validation payload writes to database in current scope.
4. Keep API contract stable across phases.

## Phase Status

| Phase | Name | Scope | Status | Start | End | Notes |
|---|---|---|---|---|---|---|
| A | Extraction Pipeline | PDF -> page images -> Qwen extraction -> merged structured output | Implemented (Pending Live OCR Verification) | 2026-04-07 | - | Endpoint and merge logic are in place; no DB writes. |
| B | Validation Engine | Rate-list matching, tolerance checks, reconciliation checks, exceptions | Implemented (Pending Live Validation Verification) | 2026-04-07 | - | Validation is now returned in API response; no DB writes. |
| C | UI Review Flow | Upload UI + results table + section summaries + exception panel | Implemented (Pending Live UX Verification) | 2026-04-07 | - | Dashboard bills review page is live with filterable validation and exception panels. |
| D | Manual Remap Loop | User maps unresolved rows and reruns validation in-memory | Implemented (Pending Live Remap Verification) | 2026-04-07 | - | Targeted revalidation API and in-session remap trace are now available. |
| E | Export + Hardening | JSON/CSV export, error hardening, run against Bill 1-4 | Implemented (Pending Live E2E Verification) | 2026-04-07 | - | Export actions and retry/partial-failure hardening are in place. |

## Detailed Phase Plan

### Phase A: Extraction Pipeline

Deliverables:
1. New bills extraction endpoint.
2. Multi-page PDF handling (all pages, not first page only).
3. Per-page OCR extraction using Qwen with strict JSON schema.
4. Deterministic merge across pages by section.
5. Extraction exceptions with confidence and parse gaps.

Acceptance checks:
1. Bill 3 and Bill 4 parse into sectioned line items.
2. Continuation tables across pages are merged correctly.
3. Empty sections are represented explicitly.
4. No extracted data is written to database.

### Phase B: Validation Engine

Deliverables:
1. Bill-focused validator for line-item checks.
2. Matching order: service code -> normalized description -> fuzzy fallback.
3. Rate comparison using revisedRate first, then rate.
4. Quantity-aware expected amount calculation.
5. Reconciliation checks (section totals and grand total).
6. Exception taxonomy:
   - MATCH
   - OVERCHARGED
   - UNDERCHARGED
   - NOT_IN_RATE_LIST
   - AMBIGUOUS_MATCH
   - DATE_OUT_OF_RANGE
   - LOW_CONFIDENCE
   - MINOR_RECONCILIATION_DIFFERENCE

Acceptance checks:
1. Validation works for all extracted rows in Bill 3 and Bill 4.
2. One-hospital mode reduces ambiguous hospital matching.
3. Minor total mismatches (<= 1 PKR) are flagged as minor reconciliation exceptions.
4. No bill extraction/validation payload writes to database.

### Phase C: UI Review Flow

Deliverables:
1. Bills upload UI.
2. Structured results table for line items.
3. Section totals and reconciliation summary.
4. Exception panel with filter/search support.

Acceptance checks:
1. User can upload bill PDF and see extracted plus validated output.
2. Output is readable for multi-page sections.
3. No persistence calls for bills payloads.

### Phase D: Manual Remap and Revalidate

Deliverables:
1. Manual remap for NOT_IN_RATE_LIST and AMBIGUOUS_MATCH rows.
2. In-memory revalidation for affected rows.
3. Change trace in current request session.

Acceptance checks:
1. User remap updates validation status without page reload.
2. Revalidation only recalculates impacted rows.
3. No persistence calls for bills payloads.

### Phase E: Export and Hardening

Deliverables:
1. Export reviewed output as JSON.
2. Export reviewed output as CSV.
3. Better error handling and retry signals for OCR failure modes.
4. End-to-end run on Bill 1, Bill 2, Bill 3, Bill 4.

Acceptance checks:
1. All four sample bills process end-to-end.
2. Exports are complete and consistent with UI values.
3. Error messaging is actionable for users.

## API Contract Draft (Current)

Endpoint:
- POST /api/extract/bills

Response shape:
1. request_id
2. metadata
3. summary_totals_printed
4. summary_totals_computed
5. line_items
6. validation_results
7. exceptions
8. reconciliation
9. token_usage

Note:
- This contract should be stable from Phase A onward.

## Update Log (Mandatory After Each Phase)

Template entry:

### Update YYYY-MM-DD HH:mm

Phase:
Status:
What was implemented:
What passed:
Known gaps:
Next phase readiness:

---

## First Update Placeholder

Phase: A
Status: Replaced by actual log entry below
What was implemented: Replaced by actual log entry below
What passed: Replaced by actual log entry below
Known gaps: Replaced by actual log entry below
Next phase readiness: Replaced by actual log entry below

### Update 2026-04-07 19:40

Phase: A
Status: Implemented (Pending live OCR verification)
What was implemented:
1. Added bills extraction endpoint at app/api/extract/bills/route.ts.
2. Added strict no-persistence behavior for bills endpoint (no extraction payload writes).
3. Implemented page-image ingestion using page_images (multi-page support) and fallback for single image upload.
4. Added strict per-page Qwen prompt and JSON parsing pipeline.
5. Added deterministic cross-page merge by section with normalized line item output.
6. Added extraction exceptions and token usage aggregation.
7. Added multi-page client helper extractAllPagesFromPDF in app/utils/pdf-extractor.ts.
What passed:
1. TypeScript/diagnostic check passes for modified files.
2. Route compiles and returns structured extraction contract fields.
3. No DB write logic for bills extraction path.
Known gaps:
1. Live end-to-end OCR verification against Bill 1-4 is pending (requires runtime API execution).
2. Direct server-side PDF rendering is not enabled in this phase; endpoint expects page_images for PDFs.
3. Validation_results payload is not included yet (planned for Phase B).
Next phase readiness: Yes, start Phase B after a quick live smoke test of Phase A endpoint.

### Update 2026-04-07 20:05

Phase: B
Status: Implemented (Pending live validation verification)
What was implemented:
1. Added bill validator module at lib/bill-validator.ts.
2. Implemented hospital/party context resolution with strict single-hospital fallback mode.
3. Implemented matching order: service code -> exact normalized description -> fuzzy similarity fallback.
4. Implemented rate selection using revisedRate first, then base rate.
5. Implemented quantity-aware expected line amount, tolerance-based deviation checks, and per-line statuses.
6. Implemented reconciliation checks for section totals and grand total with minor-mismatch tolerance.
7. Wired validation into app/api/extract/bills/route.ts and returned validation_results + reconciliation in response.
8. Kept no-persistence behavior intact for bills flow.
9. Added explicit day/month/year bill-date parsing fallback to improve effective-date matching reliability.
10. Added one-hospital fallback behavior even when strict mode is off but only one active hospital exists.
What passed:
1. TypeScript/diagnostic check passes for app/api/extract/bills/route.ts and lib/bill-validator.ts.
2. API now returns validation_results in the same extraction response.
3. No DB write path added for bills extraction or validation payloads.
Known gaps:
1. Live runtime verification against Bill 1-4 is still pending.
2. UI review flow for validation output is not implemented yet (Phase C).
3. Manual remap/revalidate loop is not implemented yet (Phase D).
Next phase readiness: Yes, proceed to Phase C.

### Update 2026-04-07 20:30

Phase: C
Status: Implemented (Pending live UX verification)
What was implemented:
1. Added new dashboard route at app/dashboard/bills/page.tsx for bills upload and review.
2. Added dashboard navigation entry for bills validation in app/dashboard/layout.tsx.
3. Implemented PDF upload flow with client-side multi-page extraction using extractAllPagesFromPDF.
4. Wired UI call to POST /api/extract/bills using page_images (no persistence calls added in UI).
5. Implemented validation line-items review table with search, section filter, and status filter.
6. Implemented reconciliation summary cards showing printed vs computed totals and reconciliation status.
7. Implemented exception panel with type filter and free-text search.
What passed:
1. TypeScript/diagnostic check passes for app/dashboard/bills/page.tsx and app/dashboard/layout.tsx.
2. UI consumes validation_results and reconciliation from Phase B API response contract.
3. No database write behavior introduced by Phase C changes.
Known gaps:
1. Live user verification against Bill 1-4 is pending.
2. Manual remap/revalidate workflow is still pending (Phase D).
3. Export actions are still pending (Phase E).
Next phase readiness: Yes, proceed to Phase D.

### Update 2026-04-07 20:50

Phase: D
Status: Implemented (Pending live remap verification)
What was implemented:
1. Added new targeted revalidation endpoint at app/api/extract/bills/revalidate/route.ts.
2. Implemented auth-gated, no-persistence revalidation using existing validator logic.
3. Added payload support for manual remap instructions (line_no -> service_code).
4. Implemented impacted-rows-only revalidation by validating only remapped lines.
5. Added remap trace output (previous status -> next status, selected code, changed flag, timestamp).
6. Added Manual Remap + Revalidate panel to app/dashboard/bills/page.tsx for unresolved rows.
7. Added in-memory merge of updated line results and local summary recomputation in app/dashboard/bills/page.tsx.
8. Added session-only Revalidation Trace table in app/dashboard/bills/page.tsx.
What passed:
1. TypeScript/diagnostic check passes for app/api/extract/bills/revalidate/route.ts.
2. TypeScript/diagnostic check passes for app/dashboard/bills/page.tsx after Phase D wiring.
3. Revalidation flow remains stateless (no DB writes for extraction/validation payloads).
Known gaps:
1. Live user verification for remap transitions on Bill 1-4 is pending.
2. Export actions are still pending (Phase E).
Next phase readiness: Yes, proceed to Phase E.

### Update 2026-04-07 21:10

Phase: E
Status: Implemented (Pending live end-to-end verification)
What was implemented:
1. Added reviewed-output export actions (JSON and CSV) to app/dashboard/bills/page.tsx.
2. JSON export now includes metadata, totals, validation results, exceptions, reconciliation, and in-session remap trace.
3. CSV export now includes validated line items, exceptions, and revalidation trace sections.
4. Added API hardening in app/api/extract/bills/route.ts with retry metadata on failures (retryable, retry_after_seconds, max_retry_attempts).
5. Added extraction health summary in app/api/extract/bills/route.ts for partial page failures.
6. Added UI warning banner for partial extraction success and failed page numbers in app/dashboard/bills/page.tsx.
7. Updated bills extraction prompt/version and persistence reason markers for Phase E in app/api/extract/bills/route.ts.
What passed:
1. TypeScript/diagnostic check passes for app/dashboard/bills/page.tsx after export and hardening additions.
2. TypeScript/diagnostic check passes for app/api/extract/bills/route.ts after retry/health additions.
3. No persistence writes introduced by Phase E changes.
Known gaps:
1. Live end-to-end runtime verification on Bill 1-4 is pending in this environment.
2. Export file content consistency for all edge cases still needs real-data smoke testing.
Next phase readiness: Core phased implementation complete; run live acceptance verification next.
