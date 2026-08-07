# Configuration

Alpacto uses environment files for local Node development and Docker Compose interpolation. Secrets must stay out of git.

## Files

| File | Purpose |
| --- | --- |
| `.env.example` | Root template for local API / worker / scripts |
| `.env` | Local secrets (gitignored) |
| `apps/web/.env.example` → `.env.local` | Browser `NEXT_PUBLIC_*` for Next.js |
| `infra/docker/.env.example` → `infra/docker/.env` | Compose stack + VPS |

Compose services also inject internal URLs (`postgres`, `redis`, `minio`) that override host-oriented values when needed.

## Browser vs server

| Kind | Examples | Safe in browser? |
| --- | ---: | --- |
| Public Next | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ZERODEV_PROJECT_ID` | Yes (baked into web build) |
| Server only | `JWT_SECRET`, `TREASURY_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `AYNI_*`, S3 keys, AI keys | Never |

There is no `NEXT_PUBLIC_ALCHEMY_API_KEY` or WalletConnect project id in the current product. RPC for servers uses `ARBITRUM_RPC_URL`.

## Environment variables

### App and URLs

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `NODE_ENV` | No | `development` / `production` | API, web |
| `APP_URL` | No | `http://localhost:3000` | API (links / CORS context) |
| `API_URL` | No | `http://localhost:4000` | API |
| `PORT` / `HOST` | No | `4000` / `0.0.0.0` | API |
| `NEXT_PUBLIC_API_URL` | Yes for web | Browser API base URL | Web build |
| `NEXT_PUBLIC_ZERODEV_PROJECT_ID` | For live producer auth | ZeroDev project id | Web |

### Database and cache

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `DATABASE_URL` | Yes | Local `…@localhost:5432/alpacto`; Docker `…@postgres:5432/alpacto` | API, Ayni, migrate, bootstrap |
| `REDIS_URL` | Yes for jobs | Local `redis://localhost:6379`; Docker `redis://redis:6379` | API, Ayni |
| `JWT_SECRET` | Yes | Change on any shared host | API |

### Object storage

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `S3_ENDPOINT` | Yes | Internal MinIO (`http://minio:9000` in Docker) | API, Ayni |
| `S3_PUBLIC_ENDPOINT` | Yes for browser uploads | Host/public MinIO URL; defaults to `S3_ENDPOINT` if unset | API (presign rewrite) |
| `S3_BUCKET` | Yes | `alpacto-evidence` | API, Ayni |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Yes | Demo defaults `alpacto` / `alpacto123` — change on VPS | API, Ayni, MinIO |
| `S3_REGION` | No | `us-east-1` | API, Ayni |

### Stripe

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `STRIPE_SECRET_KEY` | For Checkout | `sk_test_…` for MVP | API, Stripe CLI containers |
| `STRIPE_WEBHOOK_SECRET` | For verify | Empty + `STRIPE_USE_CLI=1` → auto from CLI; or Dashboard `whsec_…` | API |
| `STRIPE_USE_CLI` | No | `1` in Docker MVP | Compose Stripe services |
| `STRIPE_PRICE_MODE` | No | `demo` | API |

### Chain and ZeroDev

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `CHAIN_ID` | No | `421614` (Arbitrum Sepolia) | API / tooling |
| `ARBITRUM_RPC_URL` | Recommended | Public Sepolia RPC or Alchemy URL | API, Ayni, zero-dev scripts |
| `ALPACTO_CONTRACT_ADDRESS` | For on-chain | Current Sepolia core in [Arbitrum](ARBITRUM.md) | API, Ayni, scripts |
| `USDC_TOKEN_ADDRESS` | No | Circle test USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | API / scripts |
| `TREASURY_PRIVATE_KEY` | For funding / grants | EOA with Sepolia ETH (+ USDC for top-ups) | API, scripts |
| `ZERODEV_PROJECT_ID` | For Kernel | Dashboard project | API, Ayni, `seed:wallets` |
| `ZERODEV_BUNDLER_RPC` | For Kernel | From ZeroDev dashboard | API, Ayni, scripts |
| `ZERODEV_PAYMASTER_RPC` | Recommended | Gas sponsorship | API, Ayni, scripts |
| `AYNI_SESSION_KEY` | For attest | From `yarn ayni:session` / phase3 flow | Ayni |
| `AYNI_SMART_ACCOUNT` | For attest | Ayni Kernel address | Ayni |
| `AYNI_SERIALIZED_SESSION` | For attest | Permission session blob | Ayni |
| `AYNI_USE_FIXTURE_VISION` | No | `true` = repo fixtures (no OpenAI) | Ayni |

### AI

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `DEEPSEEK_API_KEY` | For Ayni chat / orchestrator | — | API, Ayni |
| `DEEPSEEK_MODEL` | No | `deepseek-v4-flash` | API, Ayni |
| `OPENAI_API_KEY` | When vision not fixture | — | Ayni |
| `OPENAI_VISION_MODEL` | No | `gpt-5.6-luna` | Ayni |

### Demo wallets and bootstrap

| Variable | Required | Default / notes | Used by |
| --- | ---: | --- | --- |
| `DEMO_WALLET_SEED` | No | Empty → `alpacto-local-demo-wallet-seed-v1` | API, `seed:wallets`, bootstrap |
| `DEMO_BUYER_SMART_ACCOUNT` | Optional fallback | Written by `seed:wallets` | API funding helpers |
| `DEMO_ASSOCIATION_SMART_ACCOUNT` | Optional fallback | Written by `seed:wallets` | API |
| `DEMO_MAX_FUNDING_USDC` | No | `10000` | API |
| `DEMO_LOCAL_PAYOUT_ENABLED` | No | `true` (simulates local payout UX) | API |
| `SKIP_BOOTSTRAP` | No | `0`; set `1` to skip first-boot seed/wallets | Compose bootstrap |

### Compose host ports

| Variable | Default |
| --- | --- |
| `WEB_PORT` | `3000` |
| `API_PORT` | `4000` |
| `POSTGRES_PORT` | `5432` |
| `REDIS_PORT` | `6379` |
| `MINIO_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` |

## Docker URL rules

| Variable | Must be reachable from |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | User browser |
| `S3_PUBLIC_ENDPOINT` | User browser (presigned uploads) |
| `S3_ENDPOINT` | Containers only |
| `DATABASE_URL` / `REDIS_URL` | Containers only |

Rebuild the **web** image after changing any `NEXT_PUBLIC_*` value.

## Related documents

- [Getting Started](GETTING_STARTED.md)
- [Operations](OPERATIONS.md)
- [Arbitrum](ARBITRUM.md)
- [Security](SECURITY.md)
