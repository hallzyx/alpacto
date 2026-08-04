# Alpacto

*Un pacto justo por cada fibra.*

Web 2.5 platform for transparent alpaca fiber settlement. Phase 2 adds the Fastify API, PostgreSQL, Redis, and MinIO on top of the Phase 1 onchain domain.

## Repository layout

```text
apps/
  web/           Next.js frontend (Scaffold-Stylus, includes /debug)
  api/           Fastify API (Phase 2)
  ayni-worker/   Agent worker stub
packages/
  contracts/     Stylus contracts and deploy tooling
  database/      Drizzle ORM + migrations + seed
  domain/        Integer money helpers
  shared-schemas/ Zod API schemas
infra/docker/    Postgres, Redis, MinIO
docs/
```

## Prerequisites

- Node.js 22+
- Yarn 3.2.3 (repo-pinned)
- Docker Desktop (Postgres/Redis/MinIO + Nitro for contracts)
- Rust 1.91.0 + cargo-stylus 0.10.8 (Phase 1 only)
- Foundry (`cast`) + solc 0.8.30 (Phase 1 only)

## Quick start — Phase 2 API

```bash
yarn install
cp .env.example .env

yarn docker:up
yarn db:generate   # first time only
yarn db:migrate
yarn db:seed

# Terminal 1
yarn api:dev

# Terminal 2
yarn phase2
```

API health: `http://localhost:4000/health/ready`

## Quick start — Phase 1 contracts (optional)

```bash
git submodule update --init --recursive
yarn chain          # Terminal 1
yarn deploy         # Terminal 2
yarn phase1
yarn stylus:test
yarn start          # Terminal 3 — http://localhost:3000/debug
```

## Tests

```bash
yarn test           # domain + api + stylus
yarn domain:test
yarn api:test
```

## Phase status

- **Phase 0:** Bootstrap complete.
- **Phase 1:** `AlpactoCore` + `mock-usdc`, `yarn phase1`.
- **Phase 2:** Backend/DB, `yarn phase2` checkpoint.
- **Phase 3+:** See `ALPACTO_PRD.md`.

## Docs

- Product requirements: `ALPACTO_PRD.md`
- Contract spec: `docs/contract-spec.md`
- Technical decisions: `DECISIONS.md`
- Environment template: `.env.example`
