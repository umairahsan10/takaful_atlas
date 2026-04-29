# Bills Large-PDF Reliability Plan

Owner: Aliyan + Copilot  
Created: 2026-04-27  
Mode: Phase-by-phase execution with mandatory verification before moving forward

## Objective

1. Target: near-100% successful extraction completion on real large PDFs.
2. Constraint: keep end-to-end time close to current small-PDF experience.
3. Rule: do not allow latency blow-up from stacked retries.

## Working Definition Of Success

1. Full extraction success for all pages on known problematic large PDFs.
2. If any page fails, automatic failed-page recovery resolves it within budget.
3. No request-level 500 errors for normal test documents.
4. Runtime increase stays controlled and measurable.

## Execution Protocol

1. Only one phase may be In Progress at a time.
2. Before code work in a phase, set phase status to In Progress and log start date.
3. After implementation, run that phase verification checklist.
4. Mark phase Done only when all acceptance checks pass.
5. Add a progress log entry with evidence before starting next phase.
6. If acceptance fails, set status to Blocked, record failure reason, fix, and re-verify.

## Phase Status Board

| Phase | Name | Status | Start | End | Notes |
|---|---|---|---|---|---|
| 0 | Baseline and Guardrails | In Progress | 2026-04-27 | - | Capturing baseline for time, failed pages, retries, and request-level errors. |
| 1 | Fast Lane Reliability | Not Started | - | - | Stable first-pass extraction policy for all pages. |
| 2 | Slow Lane For Failed Pages Only | Not Started | - | - | Reprocess only failed or low-confidence pages with strict budget. |
| 3 | Page Quality Preprocessing | Not Started | - | - | Apply preprocessing only when page-quality heuristics require it. |
| 4 | Multi-Engine Fallback Budget | Not Started | - | - | Optional fallback model for residual failed pages within hard limits. |
| 5 | Finalization and Consistency Controls | Not Started | - | - | Deterministic merge, validation pass, and failure transparency. |
| 6 | Performance Tuning and Rollout | Not Started | - | - | Tune thresholds and finalize release criteria. |

## Phase 0: Baseline and Guardrails

### Tasks
- [ ] Define baseline test set: 1 small PDF, 1 medium PDF, 2 known problematic large PDFs.
- [ ] Record current metrics: total runtime, failed_pages_count, partial_success, retries, 500 errors.
- [ ] Define hard time budgets: per-page timeout, per-document max duration, max extra retries.
- [ ] Define hard recovery budgets: max slow-lane pages and max fallback attempts.
- [ ] Add a single results table template to log every run consistently.

### Acceptance Checks
- [ ] Baseline metrics are recorded for all baseline documents.
- [ ] Guardrail budgets are written and agreed before phase 1 starts.

## Phase 1: Fast Lane Reliability

### Tasks
- [ ] Keep first-pass extraction path deterministic and low-latency.
- [ ] Ensure no duplicate retry layers for the same failure class.
- [ ] Ensure request-level errors do not mask already-produced page results.
- [ ] Ensure runtime metrics distinguish client retries and server page retries.
- [ ] Validate no regression for small PDFs.

### Acceptance Checks
- [ ] Small and medium PDFs complete without regression.
- [ ] Large PDFs no longer fail due to runaway retry behavior.

## Phase 2: Slow Lane For Failed Pages Only

### Tasks
- [ ] Detect failed or low-confidence pages after fast lane completes.
- [ ] Re-run only those pages with stricter extraction settings.
- [ ] Enforce max slow-lane pages per document.
- [ ] Enforce max slow-lane attempts per page.
- [ ] Merge recovered page outputs deterministically.

### Acceptance Checks
- [ ] Failed pages are reduced significantly on known problematic PDFs.
- [ ] Total runtime stays within defined document budget.

## Phase 3: Page Quality Preprocessing

### Tasks
- [ ] Add lightweight page-quality heuristics: blur, skew, orientation, low contrast.
- [ ] Trigger preprocessing only for pages that fail heuristics.
- [ ] Keep preprocessing bounded by pixel and runtime limits.
- [ ] Re-run quality-improved pages only when needed.
- [ ] Log per-page quality actions for traceability.

### Acceptance Checks
- [ ] Quality-triggered pages show improved extraction success.
- [ ] Clean pages are not penalized with extra processing time.

## Phase 4: Multi-Engine Fallback Budget

### Tasks
- [ ] Add optional fallback model for pages still failing after slow lane.
- [ ] Restrict fallback use with hard document budget.
- [ ] Keep output schema consistent across engines.
- [ ] Track fallback usage and success rate.
- [ ] Prevent fallback from triggering on already-successful pages.

### Acceptance Checks
- [ ] Residual failed pages decrease without major latency increase.
- [ ] Fallback usage remains within hard budget.

## Phase 5: Finalization and Consistency Controls

### Tasks
- [ ] Strengthen merge consistency checks for line ordering and page mapping.
- [ ] Ensure final validation runs once on merged output.
- [ ] Ensure request telemetry has one authoritative final state per request.
- [ ] Ensure error responses include actionable request context.
- [ ] Ensure exports remain consistent with reviewed output.

### Acceptance Checks
- [ ] No duplicate contradictory request outcomes in usage reporting.
- [ ] Validation and exports remain stable across repeated runs.

## Phase 6: Performance Tuning and Rollout

### Tasks
- [ ] Run benchmark matrix on baseline test set.
- [ ] Tune thresholds for best reliability-time tradeoff.
- [ ] Verify p50 and p95 runtime against baseline.
- [ ] Verify full-document completion rate trend.
- [ ] Freeze settings and document rollout notes.

### Acceptance Checks
- [ ] Completion rate reaches target on baseline large PDFs.
- [ ] Runtime remains within agreed budget envelope.
- [ ] No critical regressions in small/medium documents.

## Run Results Template

| Date | PDF | Pages | Runtime (s) | Failed Pages | Partial Success | Client Retries | Server Page Retries | Slow-Lane Pages | Fallback Pages | Request Errors | Notes |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| 2026-04-27 | Baseline run A (problematic large PDF) | 6 | 1216.64 | 4 | Yes | 0 | Unknown | 0 | 0 | 0 | Initial regression observation before latest stability patch. |
| 2026-04-27 | Baseline run B (same PDF, request 2311579c-...) | Unknown | 212.4 | Unknown | Unknown | Unknown | Unknown | 0 | 0 | 1 | Usage logs showed both SUCCESS and FAILED rows for same request id due trailing error path. |
| 2026-04-27 | Baseline run C (Bill#04 local, current codebase) | 2 | 181.29 | 1 | Yes | 0 | 0 | 0 | 0 | 0 | Small 2-page file still had 1 failed page; indicates page-level extraction issue independent of multi-chunk transport. |
| 2026-04-27 | Baseline run D (Bill#04 deployed, older build) | 2 | 154.84 | Unknown | Unknown | Unknown | Unknown | 0 | 0 | 0 | Deployed build differs from current codebase; runtime still high for 2 pages, so baseline confirms latency is not only a large-file payload problem. |
| 2026-04-27 | Baseline run E (Bill#01 local, current codebase) | 6 | 431.39 | 4 (2,3,4,5) | Yes | 0 | 0 | 0 | 0 | 0 | High partial-failure rate on local current build with chunk size 1 and OCR concurrency 1. |
| 2026-04-27 | Baseline run F (other 2-page local, current codebase) | 2 | Unknown | 2 (1,2) | Yes | Unknown | Unknown | 0 | 0 | 0 | Complete page-level OCR failure on both pages; confirms quality/model robustness issue beyond payload transport. |

## Progress Log

### 2026-04-27 - Phase 0 Started
- Status: In Progress.
- Notes: Phase 0 activated and initial baseline evidence from recent production-like runs recorded.
- Next: Capture full baseline set with one small, one medium, and two problematic large PDFs using the results template.

### 2026-04-27 - Phase 0 Baseline Update #1
- Status: In Progress.
- Notes: Added 2-page Bill#04 local and deployed observations; local current build still produced partial extraction (1 failed page) with zero retries.
- Next: Capture remaining baseline runs for second 2-page PDF and 5-page PDF, then finalize guardrail budgets.

### 2026-04-27 - Phase 0 Baseline Update #2
- Status: In Progress.
- Notes: Added local 6-page and second 2-page results; both show severe page-level failures despite conservative transport settings (chunk size 1, concurrency 1).
- Next: Finalize Phase 0 guardrail budgets and move to Phase 1 implementation focused on page-level recovery lane.

### 2026-04-27 - Plan Created
- Status: Ready to execute.
- Notes: New phased plan created with strict verification gates and explicit budgets.
- Next: Start Phase 0 baseline capture and guardrail finalization.
