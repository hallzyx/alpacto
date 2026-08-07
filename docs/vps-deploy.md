# Deploy Alpacto on a VPS (Docker Compose)

Full stack: **Postgres + Redis + MinIO + migrate + API + Ayni worker + Web**.

## Prerequisites

- Docker Engine 24+ with Compose v2
- Repo cloned on the VPS
- Secrets filled in `infra/docker/.env`

## Quick start

```bash
cd /path/to/alpacto
cp infra/docker/.env.example infra/docker/.env
# Edit infra/docker/.env:
#   APP_URL / API_URL / NEXT_PUBLIC_API_URL / S3_PUBLIC_ENDPOINT → your VPS IP or domain
#   JWT_SECRET, chain keys, ZeroDev, Stripe, DeepSeek/OpenAI as needed

# Recommended (creates .env from example if missing)
yarn docker:stack

# Or raw compose:
# docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d --build

# Optional demo seed
yarn docker:seed
```

Open:

- Web: `http://YOUR_VPS_IP:3000`
- API health: `http://YOUR_VPS_IP:4000/health`
- MinIO console: `http://YOUR_VPS_IP:9001`

## First boot vs later restarts

On an **empty Postgres volume**, `bootstrap` runs automatically after migrate:

1. `db:seed` — demo users, campaigns, orders, lots  
2. `seed:wallets` — Kernel SAs (needs `ZERODEV_PROJECT_ID` + `ZERODEV_BUNDLER_RPC`)

On later `up` / redeploys (volume already has demo data + wallets), bootstrap **no-ops** and exits 0.

Force skip anytime: `SKIP_BOOTSTRAP=1` in `infra/docker/.env`.  
Manual re-seed (destructive to mock txs): `yarn docker:seed` / `SEED_RESET_TRANSACTIONS=1`.

## Important URL rules

| Variable | Used by | Must be reachable from |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser (baked at **web image build**) | User browser |
| `S3_PUBLIC_ENDPOINT` | Presigned evidence uploads | User browser |
| `S3_ENDPOINT` | API / Ayni inside Docker | Containers (`http://minio:9000`) |
| `DATABASE_URL` / `REDIS_URL` | API / Ayni | Containers (`postgres`, `redis`) |

If you change `NEXT_PUBLIC_*`, **rebuild web**:

```bash
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d --build web
```

## Common commands

```bash
yarn docker:logs        # api + web + ayni
yarn docker:down
# Wipe DB/MinIO volumes (destructive):
docker compose -f infra/docker/docker-compose.yml --env-file infra/docker/.env down -v
```

## Stripe webhooks on a VPS (MVP, automatic)

Dokploy / public URLs are for **browsers**. Inside Compose, services talk by **name**:
`stripe` → `http://api:4000/webhooks/stripe` (not `localhost` of the VPS).

With `STRIPE_SECRET_KEY` set and `STRIPE_WEBHOOK_SECRET` **empty** + `STRIPE_USE_CLI=1` (default):

1. `stripe-whsec` runs `stripe listen --print-secret` → shared volume  
2. `api` starts and loads that `whsec_…` automatically  
3. `stripe` keeps `stripe listen --forward-to http://api:4000/webhooks/stripe` running  

No manual copy/paste. Checkout can stay on **test** keys.

When you switch to a Dashboard endpoint on your Dokploy HTTPS URL:

```bash
# infra/docker/.env
STRIPE_WEBHOOK_SECRET=whsec_from_dashboard
STRIPE_USE_CLI=0
```

Then restart; the `stripe` container idles and stops forwarding.

## Demo wallets (same as local)

Leave `DEMO_WALLET_SEED` empty in `infra/docker/.env`. Compose / API default to `alpacto-local-demo-wallet-seed-v1`, so `yarn seed:wallets` (or the seed profile after wallets were provisioned once) yields the **same Kernel addresses** as on your laptop — as long as that one-time provisioning used the same seed and you reuse the resulting `DEMO_*_SMART_ACCOUNT` / DB rows.

## Security notes for production

- Change `POSTGRES_PASSWORD`, `S3_SECRET_KEY`, `JWT_SECRET`.
- Prefer not publishing Postgres/Redis ports publicly (bind `127.0.0.1:` or remove `ports`).
- Put Web/API behind HTTPS (Caddy/Nginx/Traefik) and point `APP_URL` / `NEXT_PUBLIC_API_URL` / `S3_PUBLIC_ENDPOINT` to those hostnames.
- `TREASURY_PRIVATE_KEY` / Ayni session material must stay out of git (only in `.env` on the VPS).
