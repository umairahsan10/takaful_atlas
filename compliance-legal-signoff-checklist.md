# Compliance Legal Sign-Off Checklist

## Purpose

This document tracks legal and operational controls for the medical-claim extraction pipeline before insurer legal audit and bilateral sign-off.

## Scope

- User submits PDF/image claim document.
- System extracts first image and sends it to Atlas endpoint for Qwen VLM extraction.
- System returns structured JSON to internal claim workflow.

## Control Matrix

| Control Area | Current State | Required Evidence |
| --- | --- | --- |
| Security headers and transport hardening | Implemented in app config with production HSTS. | Header verification from production URL + config review. |
| Retention and deletion policy | Defined and partially enforced in code (timed CSV pruning). | Policy approval + retention test logs + platform backup setting evidence. |
| Access controls and key management | Policy defined; requires platform/IAM enforcement. | Role matrix, access review records, key rotation logs. |
| Vendor legal terms | Pending legal execution. | Signed DPA, BAA (if applicable), no-training clause, subprocessor annex. |
| AI governance and human review | Baseline implemented: human-review-required flag + extraction audit trail. | SOP showing final decision cannot be automated + reviewer audit records. |
| Incident response obligations | Draft obligations defined; requires legal approval. | Signed incident playbook and notification SLA annex. |
| Cross-border transfer basis | Draft requirements defined; requires jurisdictional legal completion. | Transfer mechanism annex + approved regions list. |

## Retention Policy (Defined)

- Request artifacts: 0 days. Uploaded file bytes are processed in memory by extraction route and not persisted by this API.
- Cost logs: 90 days in logs/claim-costs.csv with automatic retention pruning.
- Extraction audit logs: 365 days in logs/extraction-audit.csv with automatic retention pruning.
- Backups: 35 days target retention (must be configured and evidenced in hosting/provider tooling).

## Access Controls and Key Management (Operating Policy)

- Secrets are stored only in hosted environment secrets manager (not committed to repository).
- Production log access is restricted to least-privilege roles (security, platform ops, authorized engineering leads).
- API keys are rotated every 90 days.
- Emergency key rotation SLA: within 24 hours of suspected compromise.
- Access review cadence: monthly for secrets and production logs.

## Vendor Legal Terms (Contract Requirements)

- Execute DPA with controller/processor responsibilities.
- Execute BAA when required by applicable health-data law.
- Contractual no-training/no-retention-on-customer-data clause for model/vendor processing.
- Maintain and periodically review subprocessor list with change-notice commitments.

## AI Governance Requirements

- Human reviewer approval is required before final claim denial/payment decision.
- Automated extraction output must be treated as decision support, not autonomous adjudication.
- Audit trail must capture at minimum:
  - request_id
  - model_id
  - prompt_version(s)
  - extraction output hash
  - reviewer_id
  - reviewer_action
  - reviewer_timestamp

## Incident Response Obligations (Draft)

- T+0: detect, classify severity, preserve evidence.
- T+24h: notify insurer security/legal contact for confirmed or likely PHI/PII incident.
- T+72h: complete regulator notification where required by applicable law.
- T+5 business days: deliver written incident report with root cause and corrective actions.

Note: legal/regulatory clocks vary by jurisdiction and contract; insurer legal counsel must finalize timelines.

## Cross-Border Transfer Basis (To Finalize)

- Document all processing/storage regions used by app host, model vendor, and support access paths.
- Limit processing to approved regions listed in contract annex.
- Use lawful transfer mechanism required by applicable law (for example SCC/IDTA equivalent where relevant).
- Maintain evidence of transfer impact assessment where required.

## Sign-Off Section

| Party | Role | Name | Signature | Date |
| --- | --- | --- | --- | --- |
| Implementation Team | Processor representative |  |  |  |
| Insurance Company | Controller representative |  |  |  |
| Insurance Legal Team | Legal reviewer |  |  |  |
| Security Team | Security approver |  |  |  |
