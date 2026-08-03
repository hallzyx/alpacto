# Alpacto technical decisions

## 2026-08-03 — Phase 0 bootstrap

- **Template:** Scaffold-Stylus (`create-stylus@1.2.1`) generated intact before any restructure.
- **Evidence commit:** `chore: bootstrap from Scaffold-Stylus template` pushed to `github.com/hallzyx/alpacto` before monorepo layout changes.
- **Workspace path:** `~/dev_projects/alpacto` (WSL2, Docker Desktop).
- **Toolchain:** Rust `1.91.0`, `cargo-stylus` `0.10.8`, Yarn `3.2.3`.
- **Monorepo layout:** PRD section 12 — `apps/web` from scaffold frontend, `packages/contracts` from scaffold Stylus workspace, stubs for API/worker/shared packages.
- **Debug surface:** `/debug` preserved under `apps/web`, not linked from primary navigation.
- **Contracts:** Example `your-contract` kept for pipeline verification; `AlpactoCore` deferred to Phase 1.
