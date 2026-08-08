# Getting Started

This guide takes a contributor from a clean checkout to a working Alpacto environment. The recommended path is the full Docker Compose stack. A local Node path is available for faster TypeScript iteration.

## Quick path: Docker

### Prerequisites

- Node.js 22 or newer
- Yarn 3.2.3 (repo-pinned via `packageManager`)
- Docker Engine with Compose v2

### 1. Create configuration

```bash
cp infra/docker/.env.example infra/docker/.env
```

Edit at least:

```dotenv
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
S3_PUBLIC_ENDPOINT=http://localhost:9000
JWT_SECRET=change-me

# Required for first-boot Kernel wallets
ZERODEV_PROJECT_ID=...
ZERODEV_BUNDLER_RPC=...
ZERODEV_PAYMASTER_RPC=...
NEXT_PUBLIC_ZERODEV_PROJECT_ID=...

# Required for on-chain demo paths
ALPACTO_CONTRACT_ADDRESS=0x3d9c424814a9038ba7d4dd39c1e6a1bb58a3fc5f
TREASURY_PRIVATE_KEY=...
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Optional for Checkout / audits
STRIPE_SECRET_KEY=sk_test_...
# leave STRIPE_WEBHOOK_SECRET empty when STRIPE_USE_CLI=1
DEEPSEEK_API_KEY=...
OPENAI_API_KEY=...
AYNI_SESSION_KEY=...
AYNI_SMART_ACCOUNT=...
AYNI_SERIALIZED_SESSION=...
```

Do not commit `.env` files. See [Configuration](CONFIGURATION.md) for the full variable table.

Leave `DEMO_WALLET_SEED` empty to use `alpacto-local-demo-wallet-seed-v1` (same Kernel wallets as a typical local laptop).

### 2. Build and start

```bash
yarn install
yarn docker:stack
```

Compose starts Postgres, Redis, MinIO, migrate, **bootstrap**, API, Ayni, web, and (when configured) Stripe CLI helpers.

**First empty Postgres volume:** bootstrap runs `db:seed` then `seed:wallets`.  
**Later restarts:** bootstrap no-ops when `martina@demo.alpacto` already has a smart account address.

Skip bootstrap explicitly with `SKIP_BOOTSTRAP=1`.

### 3. Open the interfaces

| Interface | URL |
| --- | --- |
| Web | http://localhost:3000 |
| Login | http://localhost:3000/login |
| API health | http://localhost:4000/health |
| MinIO console | http://localhost:9001 |

### 4. Verify

```bash
curl http://localhost:4000/health
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env ps
```

Demo logins should work after bootstrap (for example buyer `andes@demo.alpacto` from `/login`).

## Quick path: local Node processes

Use this when iterating on TypeScript without rebuilding app images.

```bash
cp .env.example .env
# Also set apps/web/.env.local from apps/web/.env.example
yarn install
yarn docker:up          # starts full compose; or start only infra services if preferred
yarn db:migrate
# If bootstrap already seeded, skip; otherwise:
yarn db:seed
yarn seed:wallets

yarn api:dev            # :4000
yarn ayni:dev           # audit worker
yarn web:dev            # :3000
```

Root `.env` uses `localhost` hosts for Postgres/Redis/MinIO. Docker `.env` uses service DNS names (`postgres`, `redis`, `minio`).

For Stripe locally without Compose Stripe services:

```bash
stripe listen --forward-to localhost:4000/webhooks/stripe
```

Paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

## Common commands

| Command | Purpose |
| --- | --- |
| `yarn docker:stack` | Build and start the full stack |
| `yarn docker:up` | Start without rebuild |
| `yarn docker:logs` | Follow api + web + ayni |
| `yarn docker:down` | Stop containers (keeps volumes) |
| `yarn db:migrate` | Apply Drizzle migrations |
| `yarn db:seed` | Seed demo users + mock transactions |
| `yarn seed:wallets` | Provision Kernel SAs on Arbitrum Sepolia |
| `yarn fund-demo-buyer` | Send test USDC from treasury to buyer SA |
| `yarn api:dev` / `ayni:dev` / `web:dev` | Local watch processes |
| `yarn phase4` / `phase5` / `phase6` | Scripted checkpoint demos |

## First end-to-end walkthrough

Follow [Demo](DEMO.md) for the five-minute UI path (buyer fund → lot → inspection → Ayni → producer accept).

## Troubleshooting

### API unhealthy / cannot connect to database

- Confirm Postgres is healthy: `docker compose … ps`
- Confirm `DATABASE_URL` matches the environment (compose uses `@postgres:5432`, local Node uses `@localhost:5432`)

### Bootstrap skipped wallets

- Set `ZERODEV_PROJECT_ID` and `ZERODEV_BUNDLER_RPC`
- Re-run manually: `yarn seed:wallets` against the same database

### Web cannot reach API

- `NEXT_PUBLIC_API_URL` must be reachable from the browser
- Changing `NEXT_PUBLIC_*` requires rebuilding the web image (`yarn docker:stack` or rebuild `web`)

### Stripe webhook signature failures

- With Compose: leave `STRIPE_WEBHOOK_SECRET` empty and `STRIPE_USE_CLI=1`
- Locally: run `stripe listen` and copy `whsec_…`

### Evidence upload fails in the browser

- Evidence uploads go **browser → API → MinIO** (`POST /evidence/upload`) so Dokploy/Cloudflare on the MinIO host cannot block them. Keep `S3_ENDPOINT=http://minio:9000` for API/Ayni.
- Browser **CORS error** on a legacy presigned `PUT` to `S3_PUBLIC_ENDPOINT`: prefer the API upload path above; or set `S3_CORS_ORIGINS` to your web origin and avoid Cloudflare proxy on the MinIO subdomain.

## Next step

Read [Architecture](ARCHITECTURE.md) before changing service boundaries. Read [Arbitrum](ARBITRUM.md) before changing settlement or ZeroDev behavior.
