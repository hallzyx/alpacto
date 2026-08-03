# Alpacto

*Un pacto justo por cada fibra.*

Web 2.5 platform for transparent alpaca fiber settlement. Phase 0 provides the Scaffold-Stylus pipeline inside the Alpacto monorepo.

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

# Terminal 3
yarn start
```

Open `http://localhost:3000/debug` to interact with the example Stylus contract.

## Phase status

- **Phase 0:** Bootstrap complete — Rust → WASM → deploy → ABI → frontend.
- **Phase 1+:** See `ALPACTO_PRD.md`.

## Docs

- Product requirements: `ALPACTO_PRD.md`
- Technical decisions: `DECISIONS.md`
- Environment template: `.env.example`
