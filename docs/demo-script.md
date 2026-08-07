# Guion demo Alpacto — 5 minutos

Checkpoint Fase 6: demo reproducible de inicio a fin desde la UI.

## Prerrequisitos

```bash
yarn docker:up && yarn db:migrate && yarn db:seed

# Full Docker stack (API + web + Ayni + infra) — see docs/vps-deploy.md
# yarn docker:stack
yarn seed:wallets   # Kernel ECDSA real por seed en Arbitrum Sepolia
yarn fund-demo-buyer -- --amount 90   # USDC Circle test: tesorería → buyer SA (andes@)
yarn api:dev          # :4000
yarn ayni:dev         # audit worker
yarn start            # web :3000  (workspace @alpacto/web)
```

Env: `NEXT_PUBLIC_API_URL`, `DEMO_WALLET_SEED`, `ALPACTO_CONTRACT_ADDRESS`, ZeroDev/Stripe/Ayni según fases 3–5.  
Tras `seed:wallets`, cada seed (`martina@`, `andes@`, …) tiene `smart_account_address` real verificable en [Arbiscan Sepolia](https://sepolia.arbiscan.io).  
Tras `fund-demo-buyer`, el Kernel del comprador tiene USDC de test para fondear el escrow (`buyerFundOrder`).

## Wallets seed de este demo (máquina local)

Estas Kernel addresses se provisionaron en **esta PC** con `yarn seed:wallets` (2026-08-04) y son las que se usarán al **grabar el video demo** (mismo `demo-login` + mismas SA on-chain).

**Importante:** las addresses dependen de `DEMO_WALLET_SEED` en `.env`. Si cambias ese valor y vuelves a correr `yarn seed:wallets`, saldrán **otras** addresses. Con el mismo seed, el script es determinista y regenera las mismas.

| Rol | Email seed | Kernel SA (Arbitrum Sepolia) | Explorer |
|-----|------------|------------------------------|----------|
| Producer | `martina@demo.alpacto` | `0xd8b8ac1B5190026D33C93E7c3C82b87f236169E0` | [Arbiscan](https://sepolia.arbiscan.io/address/0xd8b8ac1B5190026D33C93E7c3C82b87f236169E0) |
| Inspector | `carlos@demo.alpacto` | `0x05eD462EB675BA871E53943FD3c56ca6214530b7` | [Arbiscan](https://sepolia.arbiscan.io/address/0x05eD462EB675BA871E53943FD3c56ca6214530b7) |
| Association | `alpasur@demo.alpacto` | `0x6c9ed97B4526DF8D33AFAB1383BB653C29915dFA` | [Arbiscan](https://sepolia.arbiscan.io/address/0x6c9ed97B4526DF8D33AFAB1383BB653C29915dFA) |
| Buyer | `andes@demo.alpacto` | `0xefEFE87E4b6BFDDB073B39C761f42c11645d75dA` | [Arbiscan](https://sepolia.arbiscan.io/address/0xefEFE87E4b6BFDDB073B39C761f42c11645d75dA) |
| Admin | `admin@demo.alpacto` | `0x8c15ADa74e9801DC4B97736a32b768E8E6E64B94` | [Arbiscan](https://sepolia.arbiscan.io/address/0x8c15ADa74e9801DC4B97736a32b768E8E6E64B94) |

**AlpactoCore (Sepolia, fee 0.5% platform):** `0xe651750934308720f305c5dae257d4ea1c013cdf` — [Arbiscan](https://sepolia.arbiscan.io/address/0xe651750934308720f305c5dae257d4ea1c013cdf)  
Platform treasury: `0x6F21C2155bF93b49348a422A604310F8CCd6ec74` (`setPlatformTreasury`).

Owner keys: solo en `.secrets/demo-wallets.json` (gitignored). No van en el video ni en el repo.

## Auth en el video

**Productor (recomendado para on-chain):** `/login` → **Continuar demo como Martina** (wallet Kernel real ya provisionada).  
Opcional UX Web 2.5: Email OTP / Google live (crea otra wallet ZeroDev distinta de Martina).  

Roles seed (1 clic): Comprador, Inspector, Asociación, Admin — todos con SA real tras `yarn seed:wallets`.

## Guion

1. **Login** (`/login`) — Brand Alpacto · tagline. Clic **Comprador** (`andes@demo.alpacto`).
2. **Buyer** — Crear orden nueva (presupuesto ≤ USDC en wallet buyer; hoy ~$90) → **Financiar orden** → Stripe test → escrow fondeado desde Kernel del comprador → “Fondos asegurados”.
3. **Asociación** — Logout / `/login` → **Asociación** (`alpasur@…`). En **Registrar lote**: orden nueva + Martina → **Registrar lote** (estado `registered`).
4. **Inspector** — Logout / `/login` → **Inspector** (`carlos@…`). Inspeccionar el lote nuevo → **42500 g** FINE + foto evidencia → encolar audit.
5. **Ayni** — Esperar `review_required` / timeline muestra discrepancia (42.5 vs 41.5 fixture).
6. **Productor** — `/login` → **Continuar demo como Martina** (o OTP/Google live) → ver lote → explicación en soles → **Solicitar nuevo pesaje**.
7. **Re-inspección** — Carlos: **41600 g** + evidencia → audit PASS.
8. **Liquidación** — Productor **Aceptar** → pantalla settlement → payout local **simulación** (etiqueta clara).

## Qué no decir

- No presentar Stripe Sandbox como onramp real.
- No presentar OCR/Ayni como medición oficial física.
- No mostrar MetaMask/gas al productor.

## Video de respaldo

Grabar este guion tras un dry-run estable; guardar enlace en README cuando exista.
