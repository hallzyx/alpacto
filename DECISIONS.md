# Alpacto technical decisions

## 2026-08-03 — Phase 0 bootstrap

- **Template:** Scaffold-Stylus (`create-stylus@1.2.1`) generated intact before any restructure.
- **Evidence commit:** `chore: bootstrap from Scaffold-Stylus template` pushed to `github.com/hallzyx/alpacto` before monorepo layout changes.
- **Workspace path:** `~/dev_projects/alpacto` (WSL2, Docker Desktop).
- **Toolchain:** Rust `1.91.0`, `cargo-stylus` `0.10.8`, Yarn `3.2.3`.
- **Monorepo layout:** `apps/web` product UX, `packages/contracts` Stylus workspace (`alpacto-core` + local `mock-usdc`), API/worker/shared packages.
- **Contracts:** Production Stylus contract is `alpacto-core`; `mock-usdc` for local Nitro deploy. Scaffold sample `your-contract` and `/debug` / `/blockexplorer` UI removed (2026-08-07 cleanup). Empty stub packages `config` / `contract-abi` / `contract-client` / `ui` removed. Deploy tooling + `supportedChains` + `deployedContracts.ts` kept.

## 2026-08-03 — Phase 1 domain contract

- **Crates:** `alpacto-core` + `mock-usdc` under Scaffold layout `packages/contracts/contracts/` (PRD §12 `packages/contracts/alpacto-core` satisfied via Stylus workspace).
- **Access control:** OpenZeppelin Stylus `AccessControl` for roles §14.2. Role checks use `self.vm().msg_sender()` so unit tests with `TestVM` work (OZ `msg::sender()` does not).
- **Local token:** `mock-usdc` (OZ Erc20, 6 decimals, admin `mint`). Sepolia USDC deferred to later phases via env.
- **USDC address zero:** When `usdc == address(0)`, transfers are skipped (accounting-only) for Stylus unit tests.
- **IDs:** Caller-provided `orderId` / `lotId` (offchain correlation); no auto-increment.
- **`createOrder` signature (original Phase 1):** `(orderId, buyer, association, pricingPolicyHash, budgetUsdcUnits)`. Superseded 2026-08-06 — now also requires `targetWeightGrams`.
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

## 2026-08-03 — Phase 4 Stripe sandbox

- **Checkout:** Stripe Checkout Session (test mode), `STRIPE_PRICE_MODE=demo`.
- **Conversion:** Demo 1:1 — `usdc_units = usd_cents × 10_000` (6-decimal USDC). Cap `DEMO_MAX_FUNDING_USDC` (whole USDC).
- **Webhook:** `POST /webhooks/stripe` verifies `Stripe-Signature` on raw body; handles `checkout.session.completed`.
- **Idempotency:** Unique `stripe_event_id` / `stripe_session_id` on `funding_intents`; duplicate events return 200.
- **Worker:** BullMQ `alpacto-fund-order` — buyer Kernel SA (`DEMO_WALLET_SEED` / seed wallets) `approve` + `buyerFundOrder` via ZeroDev UserOp. Treasury EOA tops up buyer USDC (`yarn fund-demo-buyer`) and gas fallback.
- **Onchain:** Worker assigns `onchain_order_id`, buyer SA calls `createOrder` if missing, then funds escrow from buyer USDC. Addresses from `users.smart_account_address` or `DEMO_*_SMART_ACCOUNT` env.
- **Legacy:** `fundOrder` (PLATFORM_ADMIN) remains for treasury/ops; Phase 4 path uses `buyerFundOrder`.
- **Local webhook:** `stripe listen --forward-to localhost:4000/webhooks/stripe`.
- **Checkpoint:** `yarn phase4` — test USD → buyer SA USDC → escrow on Sepolia.

## 2026-08-03 — Phase 5 Ayni

- **Orchestrator:** DeepSeek `deepseek-v4-flash` (OpenAI-compatible API) with thinking disabled; closed tool loop.
- **Vision:** OpenAI `gpt-5.6-luna` for scale/doc OCR; `AYNI_USE_FIXTURE_VISION=true` for deterministic local demos.
- **Worker:** `apps/ayni-worker` consumes BullMQ `alpacto-ayni-audit`; API enqueues via `POST /lots/:id/audits`.
- **Compare:** `@alpacto/domain` `compareAuditValues` — weight delta > 1% → `review_required` + `WEIGHT_MISMATCH`.
- **Settlement gate:** `POST /lots/:id/settlement/accept` rejects unless audit is `pass` or `warning`.
- **Attestation:** ZeroDev session key (`AYNI_SESSION_KEY` + `AYNI_SERIALIZED_SESSION` from `yarn phase3`) → `submitAuditAttestation` when `onchain_lot_id` present; offchain attestation otherwise.
- **Checkpoint:** `yarn phase5` — 42.5 kg declared vs 41.5 kg fixture → settlement blocked.

## 2026-08-05 — Platform fee 0.5% + dust policy

- **Platform fee:** `platformFeeBps = 50` (0.5%) on every lot settlement, stored on `pricing_policies` and applied in `@alpacto/domain` `calculateSettlementPreview`. Split is three-way from gross subtotal: association + platform + producer remainder. Escrow estimate covers all three.
- **On-chain:** `acceptSettlement` / `settleLot` take `platformUsdcUnits`; USDC pushed to `platform_treasury` (admin-set via `setPlatformTreasury`). Requires contract redeploy after this change.
- **Association fee:** unchanged demo default 300 bps (3%).

## 2026-08-06 — Kg tracking + buyer remainder withdrawal

- **`createOrder` signature (breaking):** `(orderId, buyer, association, pricingPolicyHash, budgetUsdcUnits, targetWeightGrams)` — `targetWeightGrams > 0` required.
- **Weight accounting on-chain:**
  - Ayni PASS/WARNING → reserves inspection weight grams against order capacity (`reservedWeightGrams`).
  - `settleLot` → reserved → fulfilled (CEI); only producer or `PLATFORM_ADMIN` may settle.
  - `requestReweighing` → releases the lot’s reservation.
  - Zero inspection weight rejected.
- **`withdrawRemainder(orderId)`:** buyer only; requires `fulfilled >= target`, `reserved == 0`, `remaining USDC > 0`; sends leftover escrow to buyer and marks order COMPLETED. Remanente goes to the **buyer**, not the platform.
- **`getOrder` returns 11 values** (adds `targetWeightGrams`, `reservedWeightGrams`, `fulfilledWeightGrams`). **`getLot` returns 12** (adds lot `reservedWeightGrams`).
- **API:** `GET /orders/:id/funding-status` includes chain weight fields + `canWithdrawRemainder`. `POST /orders/:id/withdraw-remainder` runs buyer Kernel UserOp then sets DB `remainingUsdcUnits=0`, `status=completed`.
- **Sepolia redeploy (2026-08-06):** `AlpactoCore` → `0x3d9c424814a9038ba7d4dd39c1e6a1bb58a3fc5f` (Arbitrum Sepolia). Root `.env` `ALPACTO_CONTRACT_ADDRESS` + `apps/web/contracts/deployedContracts.ts` updated. Post-deploy: `setPlatformTreasury`, `yarn seed:wallets` (buyer/association/inspector roles), grant `AUDITOR_AGENT_ROLE` → `AYNI_SMART_ACCOUNT`, `PLATFORM_ADMIN_ROLE` → treasury. **Orders created on the previous core are not migrated** — create/fund new orders against this address.

- **Visual:** “Altiplano contemporáneo” — Fraunces + Source Sans 3; night indigo/teal atmosphere; brand-first landing at `/`.
- **Roles seed:** buyer/inspector/association/admin via `demo-login` from `/login`.
- **Seed wallets:** `yarn seed:wallets` creates deterministic ZeroDev Kernel ECDSA accounts on Arbitrum Sepolia for every seed user, persists `users.smart_account_address`, writes owner keys to `.secrets/demo-wallets.json`, updates `DEMO_*_SMART_ACCOUNT`, and (when contract+treasury set) grants on-chain roles + dust ETH. Blockchain demo paths must be Sepolia-verifiable.
- **Producer auth:** three ZeroDev-oriented paths in UI — Google, Email OTP, Passkey — then `POST /auth/producer/session` → JWT. Video prefers Martina seed (real SA) for on-chain; live Google/OTP remain for Web 2.5 UX.
- **Screens:** `/`, `/login`, `/producer`, `/inspector`, `/association`, `/buyer/orders`, `/admin`.
- **API gaps:** `GET /orders`, `GET /lots`, `GET /pricing-policies/:id`, producer may `settlement/accept`, local payout simulate, enriched lot timeline, producer session.
- **Docs:** `docs/DEMO.md`; smoke `yarn phase6`.
- **Checkpoint:** UI demo end-to-end per demo script (API smoke verifies list/session surfaces).

## 2026-08-07 — Producer session keys (seed + Google)

- **Problem:** Backend `demoKernelForEmail(DEMO_WALLET_SEED)` only signs when `users.smart_account_address` matches the seed Kernel. Google/OTP producers store a ZeroDev wallet address the API cannot own → Kernel mismatch on `acceptSettlement` / `settleLot` / `requestReweighing`.
- **Approach:** Agent-created ZeroDev session keys (transaction automation). Server generates keypair (`POST /auth/producer/session-key/prepare`); browser owner signs empty-account approval + call policies; `complete` stores `serializedSession` + `sessionPrivateKey`. Later UserOps use `createSessionKernelClient` so `msg.sender` remains the producer’s SA.
- **Persistence:** `producer_session_keys` (mirror of `ayni_session_keys`): pending → active; prior actives revoked on rotate.
- **Policies:** Call-policy on `ALPACTO_CONTRACT_ADDRESS` limited to `acceptSettlement`, `settleLot`, `requestReweighing` (`@alpacto/zero-dev` helpers). Google wallets use Kernel **v3.3** (wallet-react); Ayni stays on v3.1.
- **Seed path unchanged:** If derived seed Kernel address matches DB → ECDSA owner key; no grant UX (`needsGrant: false`, `signerKind: seed`).
- **Missing grant:** API returns **409** `PRODUCER_SESSION_REQUIRED` (not opaque Kernel mismatch). Web shows one-time grant banner / retry on settle + reweigh.
- **MVP secret storage:** `sessionPrivateKey` stored plaintext in Postgres (not in git). Acceptable for demo; encrypt at rest before production. Buyer/association/inspector Google session keys out of scope.
