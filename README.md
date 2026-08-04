# Alpacto

*Un pacto justo por cada fibra.*

Web 2.5 platform for transparent alpaca fiber settlement. Phase 3 adds ZeroDev Kernel smart accounts on Arbitrum Sepolia.

## Repository layout

```text
apps/
  web/           Next.js frontend (Scaffold-Stylus, includes /debug)
  api/           Fastify API (Phase 2–3 auth/passkeys)
  ayni-worker/   Agent worker stub
packages/
  contracts/     Stylus contracts and deploy tooling
  database/      Drizzle ORM + migrations + seed
  domain/        Integer money helpers
  shared-schemas/ Zod API schemas
  zero-dev/      Kernel / paymaster / session-key helpers
infra/docker/    Postgres, Redis, MinIO
docs/
```

## Prerequisites

- Node.js 22+
- Yarn 3.2.3 (repo-pinned)
- Docker Desktop (Postgres/Redis/MinIO + Nitro for local contracts)
- Rust 1.91.0 + cargo-stylus 0.10.8
- Foundry (`cast`) + solc 0.8.30
- ZeroDev project with Arbitrum Sepolia (enable Gas Policy for sponsorship)
- Sepolia deploy key with ETH + optional Circle test USDC

## Quick start — Phase 3 (ZeroDev / Sepolia)

```bash
# Fill root .env + packages/contracts/.env (PRIVATE_KEY_SEPOLIA)
yarn deploy --network sepolia
# writes ALPACTO_CONTRACT_ADDRESS

yarn phase3
# Kernel UserOps: createOrder → fund → lot → inspection → Ayni → requestReweighing
```

If ZeroDev paymaster policy is not enabled, `yarn phase3` funds smart accounts with ETH from the admin and still runs without MetaMask.

Passkey API (browser): `POST /auth/passkey/register|login/*` on `yarn api:dev`.

## Quick start — Phase 2 API

```bash
yarn install
cp .env.example .env
yarn docker:up && yarn db:migrate && yarn db:seed
yarn api:dev    # Terminal 1
yarn phase2     # Terminal 2
```

## Quick start — Phase 1 contracts (Nitro)

```bash
yarn chain && yarn deploy && yarn phase1
```

## Tests

```bash
yarn test           # domain + api + stylus
```

## Phase status

- **Phase 0–1:** Scaffold + `AlpactoCore` / `mock-usdc` on Nitro.
- **Phase 2:** Backend/DB, `yarn phase2`.
- **Phase 3:** ZeroDev Kernel on Sepolia, `yarn phase3`.
- **Phase 4+:** See `ALPACTO_PRD.md`.

## Docs

- Product requirements: `ALPACTO_PRD.md`
- Contract spec: `docs/contract-spec.md`
- Technical decisions: `DECISIONS.md`
- Environment template: `.env.example`
