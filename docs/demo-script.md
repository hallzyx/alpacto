# Guion demo Alpacto — 5 minutos

Checkpoint Fase 6: demo reproducible de inicio a fin desde la UI.

## Prerrequisitos

```bash
yarn docker:up && yarn db:migrate && yarn db:seed
yarn api:dev          # :4000
yarn ayni:dev         # audit worker
yarn start            # web :3000  (workspace @alpacto/web)
```

Env: `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000`, Stripe/Ayni/ZeroDev según fases 3–5.

## Auth en el video

Usar **una** sola opción de productor (recomendado: Email OTP con código demo `123456`).  
Google y Passkey quedan visibles en `/auth/producer` para revisión de código/docs.

Roles seed (1 clic en landing): Comprador, Inspector, Asociación, Admin.

## Guion

1. **Landing** — Brand Alpacto · tagline. Clic **Comprador** (`andes@demo.alpacto`).
2. **Buyer** — Abrir orden seed / listado → **Financiar orden** → Stripe test (o status funded si ya fondeada) → “Fondos asegurados”.
3. **Inspector** — Logout / landing → **Inspector** (`carlos@…`). Registrar lote si hace falta → inspeccionar **42500 g** FINE + foto evidencia → encolar audit.
4. **Ayni** — Esperar `review_required` / timeline muestra discrepancia (42.5 vs 41.5 fixture).
5. **Productor** — Landing → **Soy productor** → Email OTP (o Passkey/Google) → ver lote → explicación en soles → **Solicitar nuevo pesaje**.
6. **Re-inspección** — Carlos: **41600 g** + evidencia → audit PASS.
7. **Liquidación** — Productor **Aceptar** → pantalla settlement → payout local **simulación** (etiqueta clara).

## Qué no decir

- No presentar Stripe Sandbox como onramp real.
- No presentar OCR/Ayni como medición oficial física.
- No mostrar MetaMask/gas al productor.

## Video de respaldo

Grabar este guion tras un dry-run estable; guardar enlace en README cuando exista.
