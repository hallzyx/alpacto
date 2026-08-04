# Alpacto

*Un pacto justo por cada fibra.*

Web 2.5 platform for transparent alpaca fiber settlement. Phase 1 delivers the onchain domain (`AlpactoCore` + local `mock-usdc`) on the Scaffold-Stylus pipeline.

## Repository layout

```text
apps/
  web/           Next.js frontend (Scaffold-Stylus, includes /debug)
  api/           Fastify API stub
  ayni-worker/   Agent worker stub
packages/
  contracts/     Stylus contracts and deploy tooling
  contract-abi/  ABI package stub
  contract-client/
  database/
  domain/
  shared-schemas/
  ui/
  zero-dev/
  config/
infra/
  docker/
  deployment/
  scripts/
docs/
```

## Prerequisites

- Node.js 22+
- Yarn 3.2.3 (repo-pinned)
- Rust 1.91.0
- cargo-stylus 0.10.8
- Docker Desktop (Nitro devnode)
- Foundry (`cast`) for local chain scripts
- solc 0.8.30 (ABI export)

## Quick start

```bash
yarn install
git submodule update --init --recursive

# Terminal 1
yarn chain

# Terminal 2
yarn deploy

# Optional: full Phase 1 flows (roles, mint, settle)
yarn phase1
yarn phase1 -- --flow=reweigh

# Unit tests (cargo) for Stylus crates
yarn stylus:test

# Terminal 3
yarn start
```

Open `http://localhost:3000/debug` to interact with `alpacto-core` / `mock-usdc` (and the example `your-contract`).

## Phase status

- **Phase 0:** Bootstrap complete — Rust → WASM → deploy → ABI → frontend.
- **Phase 1:** `AlpactoCore` domain + `mock-usdc`, cargo tests §21.1, `yarn phase1` scripts.
- **Phase 2+:** See `ALPACTO_PRD.md`.

## Docs

- Product requirements: `ALPACTO_PRD.md`
- Contract spec: `docs/contract-spec.md`
- Technical decisions: `DECISIONS.md`
- Environment template: `.env.example`
