# Compliance Hardening Log

## Scope

Track implementation progress for legal/compliance controls in the claim-extraction pipeline.

## Change Log

### 2026-04-04

- Completed: Removed client-side extraction logs that could expose PHI/PII from `app/claim-form/page.tsx`.
- Completed: Removed raw model content from API error response when JSON parsing fails in `app/api/extract/route.ts`.
- Completed: Replaced identifiable file-name logging with pseudonymous `request_id` logging in `app/api/extract/route.ts` and cost CSV header.
- Completed: Added security headers in `next.config.ts`, including production HSTS.
- Completed: Reduced API error detail exposure in production while retaining `request_id` traceability in `app/api/extract/route.ts`.
- Completed: Implemented timed log retention pruning in `app/api/extract/route.ts` for cost logs and extraction audit logs.
- Completed: Added AI governance metadata in API response and extraction audit trail records in `app/api/extract/route.ts`.

## Current Status

- [x] Sensitive logging controls (client extraction logs)
- [x] Error data leakage prevention (raw model payload)
- [x] Data minimization in stored cost logs (request ID instead of file name)
- [x] Security headers + production HSTS
- [x] Production-safe API error details
- [x] Timed deletion for operational logs
- [x] AI extraction audit trail + human-review-required flag

## Retention Policy (Defined)

- Request artifacts: `0` days. Uploaded document bytes are processed in memory and not persisted by this API route.
- Cost logs (`logs/claim-costs.csv`): `90` days, auto-pruned on each write.
- Extraction audit logs (`logs/extraction-audit.csv`): `365` days, auto-pruned on each write.
- Backups: `35` days target retention policy (platform/provider configuration + legal sign-off required).

## Next Recommended Items

- Rotate or securely delete historical `logs/claim-costs.csv` files created before 2026-04-04 if they contain claim file names.
- Implement reviewer action capture (reviewer id, action, timestamp) to complete full AI decision audit chain.
- Apply key-rotation and access-review operating procedure in hosting/logging platforms.
- Finalize legal agreements and cross-border transfer annex with insurer legal team.
