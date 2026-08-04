# Ayni agent security

## Scope

Ayni is a **read-and-attest** agent. It reviews inspection evidence and submits `submitAuditAttestation` on AlpactoCore. It never moves funds.

## Closed tool set

| Tool | Purpose |
|------|---------|
| `get_audit_context` | Load lot, inspection, pricing, evidence metadata |
| `extract_scale_evidence` | OpenAI vision OCR on scale photo |
| `extract_classification_document` | OpenAI vision OCR on classification doc |
| `calculate_settlement` | Deterministic integer math via `@alpacto/domain` |
| `compare_audit_values` | Declared vs observed; 1% weight tolerance |
| `create_audit_report` | Persist `audit_runs` / `audit_findings` + report hash |
| `submit_audit_attestation` | ZeroDev session UserOp (attestation only) |

The LLM orchestrator (DeepSeek) may only invoke these tools. Financial calculations are forbidden in the model layer.

## Session key limits

- Kernel session key from `yarn phase3` (`AYNI_SESSION_KEY`, `AYNI_SERIALIZED_SESSION`)
- Call policy allows **only** `submitAuditAttestation` on `ALPACTO_CONTRACT_ADDRESS`
- No ETH or ERC-20 transfers
- Requires `AUDITOR_AGENT_ROLE` on the Ayni smart account

## Revocation

`POST /admin/ayni/session-key/revoke` marks session keys revoked in DB and should be used when rotating keys.

## Privacy (vision)

Before sending images to OpenAI:

- Validate MIME type and size (API upload-url schema)
- Do not send PII fields from DB alongside raw images
- Use `AYNI_USE_FIXTURE_VISION=true` only for local demos without external vision calls

## Settlement gate

`POST /lots/:id/settlement/accept` is rejected unless the latest audit `result_code` is `pass` or `warning`. `review_required` and `unreadable` block settlement.
