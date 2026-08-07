# Demo

Five-minute end-to-end walkthrough from the product UI. Use this after [Getting Started](GETTING_STARTED.md) so bootstrap (or manual seed + wallets) has already run.

## Quick path

```bash
# Preferred: full stack with first-boot seed + wallets
cp infra/docker/.env.example infra/docker/.env   # fill ZeroDev, contract, treasury, Stripe test, Ayni…
yarn docker:stack

# If buyer needs more Sepolia test USDC:
yarn fund-demo-buyer -- --amount 90
```

Open http://localhost:3000/login.

For local Node instead of Compose app containers, run `yarn api:dev`, `yarn ayni:dev`, and `yarn web:dev` against infra + seed/wallets.

## Prerequisites checklist

| Item | Notes |
| --- | --- |
| Postgres seeded | Bootstrap or `yarn db:seed` |
| Kernel SAs | Bootstrap or `yarn seed:wallets` |
| `DEMO_WALLET_SEED` | Empty → `alpacto-local-demo-wallet-seed-v1` (same addresses across machines) |
| `ALPACTO_CONTRACT_ADDRESS` | Sepolia core — see [Arbitrum](ARBITRUM.md) |
| Stripe test | Compose Stripe CLI or local `stripe listen` |
| Ayni | Worker up; fixture vision OK for OCR mismatch story |

## Seed wallets

Addresses are **deterministic** from `DEMO_WALLET_SEED` + email. Do not treat a one-off laptop table as the only source of truth — read current addresses from Postgres (`users.smart_account_address`) or `.secrets/demo-wallets.json` after `seed:wallets`.

With the default seed, the usual demo emails are:

| Role | Email |
| --- | --- |
| Producer | `martina@demo.alpacto` |
| Inspector | `carlos@demo.alpacto` |
| Association | `alpasur@demo.alpacto` |
| Buyer | `andes@demo.alpacto` |
| Admin | `admin@demo.alpacto` |

Verify on [Arbiscan Sepolia](https://sepolia.arbiscan.io) using the Kernel address stored in the DB. Owner keys stay in `.secrets/demo-wallets.json` (gitignored) — never show them on camera.

Canonical Sepolia `AlpactoCore`: `0x3d9c424814a9038ba7d4dd39c1e6a1bb58a3fc5f` ([Arbiscan](https://sepolia.arbiscan.io/address/0x3d9c424814a9038ba7d4dd39c1e6a1bb58a3fc5f)).

## Auth for the video

**Producer (recommended for on-chain):** `/login` → continue as Martina demo (seed Kernel already provisioned).

Optional Web 2.5 UX: live Email OTP / Google creates a **different** ZeroDev wallet than Martina.

One-click seed roles: Buyer, Inspector, Association, Admin — all have real SAs after `seed:wallets`.

## Script

1. **Login** (`/login`) — choose **Buyer** (`andes@demo.alpacto`).
2. **Buyer** — create a new order (budget ≤ USDC on buyer Kernel) → **Fund order** → Stripe test → escrow funded from buyer Kernel → funds secured.
3. **Association** — log out → **Association** (`alpasur@…`) → **Register lot** for the new order + Martina → lot `registered`.
4. **Inspector** — **Inspector** (`carlos@…`) → inspect lot → **42500 g** FINE + evidence → enqueue audit.
5. **Ayni** — wait for `review_required` / timeline discrepancy (fixture 42.5 vs 41.5).
6. **Producer** — continue as Martina → review lot → **Request reweigh**.
7. **Re-inspection** — Carlos: **41600 g** + evidence → audit PASS.
8. **Settlement** — producer **Accept** → settlement screen → local payout **simulation** when `DEMO_LOCAL_PAYOUT_ENABLED=true` (label clearly).

## What not to claim

- Do not present Stripe Sandbox as a live fiat on-ramp.
- Do not present Ayni OCR as official physical metrology.
- Do not show MetaMask or gas UX to the producer.

## Related documents

- [Getting Started](GETTING_STARTED.md)
- [Operations](OPERATIONS.md)
- [Arbitrum](ARBITRUM.md)
- [Ayni](AYNI.md)
- [Security](SECURITY.md)
