# Testing and Verification

Alpacto uses workspace Vitest suites for domain and API logic, Stylus/cargo tests for contracts, and TypeScript checks for the web app.

## Quick path

```bash
yarn web:check-types
yarn domain:test
yarn api:test
yarn stylus:test
# or
yarn test    # domain + api + stylus
```

## Workspace commands

| Command | Coverage |
| --- | --- |
| `yarn domain:test` | Integer money / funding / audit helpers in `@alpacto/domain` |
| `yarn api:test` | Validation, settlement gate, funding helpers, Ayni tool smoke |
| `yarn stylus:test` | Stylus crate unit tests via `@alpacto/contracts` |
| `yarn web:check-types` | Next.js / TypeScript check |
| `yarn web:lint` | ESLint for web |
| `yarn phase4` / `phase5` / `phase6` | Scripted integration checkpoints (need env + running services) |

## API test prerequisites

Several API tests talk to Postgres:

1. Start infra (`yarn docker:up` or full stack).
2. `yarn db:migrate`
3. `yarn db:seed`
4. For `funding-helpers` (association smart account assertion): `yarn seed:wallets`

Without seed data, Ayni tool smoke skips or fails with “Seed data missing”. Without wallets, `smartAccountAddress` assertions fail.

Unit-style suites (`validation`, `settlement-gate`, `funding` money helpers) do not require chain connectivity.

## Test areas

### Domain

Pure helpers for USDC/PEN math and settlement gates — no Docker required.

### API

- Request schema validation
- Settlement accept gate (`pass` / `warning` only)
- Association user resolution for org membership
- Ayni tool schema ↔ handler smoke against seeded DB

### Contracts

`yarn stylus:test` runs cargo tests under `packages/contracts/contracts/*`. Local Nitro (`yarn chain` + `yarn deploy` + `yarn phase1`) is a separate manual/contract demo path, not part of `yarn test`.

### Web

`yarn web:check-types` is the primary automated web check. Prefer a manual smoke in the browser after UI changes.

## Manual smoke

1. `yarn docker:stack` (or local `api:dev` + `web:dev` with infra up).
2. `curl http://localhost:4000/health` → ok.
3. Open http://localhost:3000/login and enter as buyer seed.
4. Confirm campaigns/orders appear (bootstrap/seed present).
5. Optional: follow [Demo](DEMO.md) through funding and inspection.

## Live chain notes

Automated tests **do not** spend Sepolia funds. Live settlement must be verified with controlled UserOps and Arbiscan links ([Arbitrum](ARBITRUM.md), [Demo](DEMO.md)).

## Related documents

- [Getting Started](GETTING_STARTED.md)
- [Operations](OPERATIONS.md)
- [Demo](DEMO.md)
