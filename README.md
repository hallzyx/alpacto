# Alpacto

*Un pacto justo por cada fibra.*

Web 2.5 platform for transparent alpaca fiber settlement. Phase 4 adds Stripe sandbox funding to Sepolia USDC escrow.

## Repository layout

```text
apps/
  web/           Next.js frontend (Scaffold-Stylus, includes /debug)
  api/           Fastify API (Phase 2–4 auth, passkeys, Stripe funding)
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
- Stripe test keys + [Stripe CLI](https://stripe.com/docs/stripe-cli) for local webhooks

## Quick start — Phase 4 (Stripe → Sepolia escrow)

```bash
yarn docker:up && yarn db:migrate && yarn db:seed
# .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ALPACTO_CONTRACT_ADDRESS,
#       TREASURY_PRIVATE_KEY, DEMO_BUYER_SMART_ACCOUNT, DEMO_ASSOCIATION_SMART_ACCOUNT

yarn api:dev    # Terminal 1
stripe listen --forward-to localhost:4000/webhooks/stripe   # Terminal 2 (optional; phase4 simulates webhook)
yarn phase4     # Terminal 3
```

`yarn phase4` creates a $10 order, opens Checkout, simulates `checkout.session.completed`, and polls until USDC is in escrow on Sepolia.

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
- **Phase 4:** Stripe sandbox → USDC escrow, `yarn phase4`.
- **Phase 5+:** See `ALPACTO_PRD.md`.

## Docs

- Product requirements: `ALPACTO_PRD.md`
- Contract spec: `docs/contract-spec.md`
- Technical decisions: `DECISIONS.md`
- Environment template: `.env.example`
