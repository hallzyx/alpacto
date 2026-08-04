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
