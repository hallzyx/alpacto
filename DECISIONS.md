# Alpacto technical decisions

## 2026-08-03 — Phase 0 bootstrap

- **Template:** Scaffold-Stylus (`create-stylus@1.2.1`) generated intact before any restructure.
- **Evidence commit:** `chore: bootstrap from Scaffold-Stylus template` pushed to `github.com/hallzyx/alpacto` before monorepo layout changes.
- **Workspace path:** `~/dev_projects/alpacto` (WSL2, Docker Desktop).
- **Toolchain:** Rust `1.91.0`, `cargo-stylus` `0.10.8`, Yarn `3.2.3`.
- **Monorepo layout:** PRD section 12 — `apps/web` from scaffold frontend, `packages/contracts` from scaffold Stylus workspace, stubs for API/worker/shared packages.
- **Debug surface:** `/debug` preserved under `apps/web`, not linked from primary navigation.
- **Contracts:** Example `your-contract` kept for pipeline verification; `AlpactoCore` deferred to Phase 1.

## 2026-08-03 — Phase 1 domain contract

- **Crates:** `alpacto-core` + `mock-usdc` under Scaffold layout `packages/contracts/contracts/` (PRD §12 `packages/contracts/alpacto-core` satisfied via Stylus workspace).
- **Access control:** OpenZeppelin Stylus `AccessControl` for roles §14.2. Role checks use `self.vm().msg_sender()` so unit tests with `TestVM` work (OZ `msg::sender()` does not).
- **Local token:** `mock-usdc` (OZ Erc20, 6 decimals, admin `mint`). Sepolia USDC deferred to later phases via env.
- **USDC address zero:** When `usdc == address(0)`, transfers are skipped (accounting-only) for Stylus unit tests.
- **IDs:** Caller-provided `orderId` / `lotId` (offchain correlation); no auto-increment.
- **`createOrder` signature:** `(orderId, buyer, association, pricingPolicyHash, budgetUsdcUnits)`.
- **`fundOrder`:** Platform admin; unique `paymentReferenceHash`; IERC20 `transferFrom` caller → contract.
- **Deploy:** `yarn deploy` deploys `mock-usdc` then `alpacto-core(admin, mockUsdc)`. Demo scripts: `yarn phase1` / `yarn phase1 -- --flow=reweigh`.
- **Deploy tooling:** `executeCommand` treats cargo-stylus stderr as success when exit code is 0 unless a real rustc `error` is present (address logs live on stderr).

## 2026-08-03 — Phase 2 backend and DB

- **Checkpoint:** API-operable flow without AI or ZeroDev (PRD §25 Fase 2).
- **Auth:** `POST /auth/demo-login` with JWT (HS256, `JWT_SECRET`). Passkeys deferred to Phase 3.
- **Offchain-first:** Postgres is source of truth for Phase 2; `onchain_*` and `tx_hash` columns nullable until later phases wire chain writes.
- **Schema:** Full PRD §13.1 tables in Drizzle now (including `funding_intents`, `audit_*`, `settlements`) to avoid rework; Stripe/Ayni endpoints not exposed yet.
- **Infra:** `infra/docker/docker-compose.yml` — Postgres 16, Redis 7, MinIO (`alpacto-evidence` bucket).
- **Jobs:** BullMQ scaffold (`ping`, `evidence.finalize`); Stripe/Ayni workers in Phases 4–5.
- **Money:** Integer-only helpers in `@alpacto/domain`; API validation via `@alpacto/shared-schemas` (Zod).

## 2026-08-03 — Phase 3 ZeroDev

- **Network:** Arbitrum Sepolia (`421614`). Nitro is not used for AA.
- **USDC:** Circle native test USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`.
- **Deploy:** `yarn deploy --network sepolia` deploys only `alpacto-core(admin, usdc)` (no mock-usdc).
- **Admin/owner:** EOA from `PRIVATE_KEY_SEPOLIA` / `TREASURY_PRIVATE_KEY` receives `DEFAULT_ADMIN_ROLE`.
- **Package:** `@alpacto/zero-dev` — Kernel v3.1 + EntryPoint 0.7, ECDSA validators, call-policy session keys, paymaster client.
- **Paymaster:** Prefer ZeroDev gas policy. If policy missing, Phase 3 demo funds smart accounts with ETH from admin and sends UserOps without paymaster (still no MetaMask).
- **Passkeys:** API routes `@simplewebauthn/server` under `/auth/passkey/*`; links Kernel ECDSA smart account address on register. Browser passkey-validator wiring deferred to UX phase.
- **Ayni:** Session key generated in `yarn phase3`, stored as `AYNI_SESSION_KEY`; `AUDITOR_AGENT_ROLE` granted; revoke via `POST /admin/ayni/session-key/revoke`.
- **Checkpoint:** `yarn phase3` — producer `requestReweighing` via Kernel UserOp.
