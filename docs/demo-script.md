# Guion demo Alpacto — 5 minutos

Checkpoint Fase 6: demo reproducible de inicio a fin desde la UI.

## Prerrequisitos

```bash
yarn docker:up && yarn db:migrate && yarn db:seed
yarn seed:wallets   # Kernel ECDSA real por seed en Arbitrum Sepolia
yarn api:dev          # :4000
yarn ayni:dev         # audit worker
yarn start            # web :3000  (workspace @alpacto/web)
```

Env: `NEXT_PUBLIC_API_URL`, `DEMO_WALLET_SEED`, ZeroDev/Stripe/Ayni según fases 3–5.  
Tras `seed:wallets`, cada seed (`martina@`, `andes@`, …) tiene `smart_account_address` real verificable en [Arbiscan Sepolia](https://sepolia.arbiscan.io).

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

Owner keys: solo en `.secrets/demo-wallets.json` (gitignored). No van en el video ni en el repo.

## Auth en el video

**Productor (recomendado para on-chain):** landing → **Continuar demo como Martina** (wallet Kernel real ya provisionada).  
Opcional UX Web 2.5: Email OTP / Google live (crea otra wallet ZeroDev distinta de Martina).  

Roles seed (1 clic): Comprador, Inspector, Asociación, Admin — todos con SA real tras `yarn seed:wallets`.

## Guion

1. **Landing** — Brand Alpacto · tagline. Clic **Comprador** (`andes@demo.alpacto`).
2. **Buyer** — Abrir orden seed / listado → **Financiar orden** → Stripe test (o status funded si ya fondeada) → “Fondos asegurados”.
3. **Inspector** — Logout / landing → **Inspector** (`carlos@…`). Registrar lote si hace falta → inspeccionar **42500 g** FINE + foto evidencia → encolar audit.
4. **Ayni** — Esperar `review_required` / timeline muestra discrepancia (42.5 vs 41.5 fixture).
5. **Productor** — Landing → **Continuar demo como Martina** (o OTP/Google live) → ver lote → explicación en soles → **Solicitar nuevo pesaje**.
6. **Re-inspección** — Carlos: **41600 g** + evidencia → audit PASS.
7. **Liquidación** — Productor **Aceptar** → pantalla settlement → payout local **simulación** (etiqueta clara).

## Qué no decir

- No presentar Stripe Sandbox como onramp real.
- No presentar OCR/Ayni como medición oficial física.
- No mostrar MetaMask/gas al productor.

## Video de respaldo

Grabar este guion tras un dry-run estable; guardar enlace en README cuando exista.
