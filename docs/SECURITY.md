# Security Model

Alpacto separates browser access, API orchestration, audit attestation, and on-chain settlement. This document describes the current MVP posture and the boundaries that must remain intact.

## Security principles

1. Producers never need MetaMask, seed phrases, or gas wallets in the happy path.
2. The browser never receives treasury keys, Stripe secrets, or Ayni session private material.
3. Ayni is attestation-only and must not move funds.
4. The API is the policy authority for auth, funding webhooks, and settlement gates.
5. Failed or rejected audits must not unlock settlement accept.
6. Docker MVP defaults are not production hardening.

## Credential boundaries

| Credential | Allowed location | Never expose to |
| --- | --- | --- |
| `TREASURY_PRIVATE_KEY` | API / ops scripts env | Browser, MCP, public logs |
| `JWT_SECRET` | API env | Browser |
| `STRIPE_SECRET_KEY` / webhook secret | API (+ Stripe CLI container) | Browser |
| `AYNI_SESSION_KEY` / `AYNI_SERIALIZED_SESSION` | Ayni worker env | Browser, unrelated services |
| Producer session private key | API DB (server-side) after grant | Other users / client responses |
| `DEMO_WALLET_SEED` + `.secrets/demo-wallets.json` | Ops machine / gitignored secrets | Repo, video demos, public docs dumps |
| `S3_SECRET_KEY` | API, Ayni, MinIO | Browser |
| `NEXT_PUBLIC_*` | Web build | Expected public |

## Authentication

- Demo roles use `POST /auth/demo-login` → JWT.
- Producers may use ZeroDev Google / Email OTP / Passkey, then `POST /auth/producer/session` → JWT.
- Passkey ceremony endpoints live under `/auth/passkey/*`.
- Producer session-key grant (`prepare` / `complete`) lets the API sign limited UserOps as the producer Kernel SA without holding the owner key long-term beyond the stored session material.

Password auth is not offered (ZeroDev has no native password path in this product).

## Ayni agent limits

Ayni may only use a closed tool set (see [Ayni](AYNI.md)). Financial math is done in `@alpacto/domain`, not by free-form LLM arithmetic.

Session call policy allows **only** `submitAuditAttestation` on `ALPACTO_CONTRACT_ADDRESS`. The Ayni smart account needs `AUDITOR_AGENT_ROLE`.

Revoke via admin: `POST /admin/ayni/session-key/revoke` when rotating keys.

## Settlement gate

`POST /lots/:id/settlement/accept` is rejected unless the latest audit `result_code` is `pass` or `warning`. `review_required` and `unreadable` block settlement.

## Vision privacy

Before sending images to OpenAI:

- validate MIME type and size at upload-url time;
- avoid attaching unnecessary PII from the DB to vision prompts;
- use `AYNI_USE_FIXTURE_VISION=true` for demos without external vision calls.

## Docker / VPS exposure (MVP)

Default Compose publishes Postgres (`5432`), Redis (`6379`), and MinIO (`9000`/`9001`) on the host. That is convenient for development and dangerous on an open VPS with demo passwords.

Before public deployment:

- change `POSTGRES_PASSWORD`, `S3_SECRET_KEY`, `JWT_SECRET`;
- do not publish DB/Redis/console ports publicly;
- terminate HTTPS for web/API;
- keep treasury and Ayni material only in server env.

## Stripe

MVP Compose uses Stripe CLI forwarding on the internal Docker network. Prefer test keys until a Dashboard HTTPS endpoint is configured ([Operations](OPERATIONS.md)).

## Related documents

- [Architecture](ARCHITECTURE.md)
- [Ayni](AYNI.md)
- [Arbitrum](ARBITRUM.md)
- [Operations](OPERATIONS.md)
- [Configuration](CONFIGURATION.md)
