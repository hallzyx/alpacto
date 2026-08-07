# Alpacto contract spec

Onchain domain for Phase 1: `AlpactoCore` + local `mock-usdc` (ERC20, 6 decimals).

## Crates

| Crate | Path | Purpose |
|-------|------|---------|
| `alpacto-core` | `packages/contracts/contracts/alpacto-core/` | Orders, lots, escrow USDC, inspections, attestations, settlement |
| `mock-usdc` | `packages/contracts/contracts/mock-usdc/` | Mintable USDC stand-in for Nitro |

Constructor:

- `mock-usdc(admin)`
- `alpacto-core(admin, usdcToken)` — pass `address(0)` for accounting-only unit tests (no ERC20 calls)

## Roles (AccessControl)

| Role | Typical callers |
|------|-----------------|
| `DEFAULT_ADMIN_ROLE` | Deploy admin (grant/revoke) |
| `PLATFORM_ADMIN_ROLE` | Treasury / `fundOrder` (ops / legacy) |
| `BUYER_ROLE` | `createOrder`, `buyerFundOrder` |
| `ASSOCIATION_ROLE` | `registerLot` |
| `INSPECTOR_ROLE` | `registerLot`, `submitInspectionReference` |
| `AUDITOR_AGENT_ROLE` | `submitAuditAttestation` only (no transfers / settle) |

Producer of a lot (EOA stored on lot) may `requestReweighing`, `acceptSettlement`, and `settleLot`.

## IDs

`orderId` and `lotId` are **caller-provided** `uint256` values (offchain correlation). No opaque auto-increment.

## Enums

```text
OrderStatus: Draft=0, Funded=1, AcceptingLots=2, PartiallySettled=3, Completed=4, Cancelled=5
LotStatus:   Registered=0, InspectionSubmitted=1, Auditing=2, ReadyForReview=3,
             ReviewRequired=4, ReweighingRequested=5, ProducerAccepted=6, Settled=7, Cancelled=8
AuditResult: Pass=0, Warning=1, ReviewRequired=2, Unreadable=3
```

## Public API

```text
createOrder(orderId, buyer, association, pricingPolicyHash, budgetUsdcUnits)
fundOrder(orderId, amount, paymentReferenceHash)           // PLATFORM_ADMIN
buyerFundOrder(orderId, amount, paymentReferenceHash)      // BUYER == order.buyer
registerLot(orderId, lotId, producerAccount)
submitInspectionReference(lotId, version, weightGrams, categoryCode, evidenceHash)
submitAuditAttestation(lotId, version, reportHash, result)
requestReweighing(lotId, reasonHash)
acceptSettlement(lotId, version, quoteHash, netPenMinor, producerUsdcUnits, associationUsdcUnits, platformUsdcUnits)
settleLot(lotId)

getOrder(orderId)
getLot(lotId)
getAuditAttestation(lotId, version)
```

## Rules (summary)

| Function | Key rules |
|----------|-----------|
| `createOrder` | Buyer role; Draft; unique `orderId` |
| `fundOrder` | Platform admin; unique `paymentReferenceHash`; `transferFrom` caller → contract; remaining += amount; → AcceptingLots |
| `buyerFundOrder` | Buyer role + `msg.sender == order.buyer`; same accounting as `fundOrder` |
| `registerLot` | Association or inspector; order AcceptingLots/PartiallySettled; unique `lotId` |
| `submitInspectionReference` | Inspector; version == current+1 (or 1 if 0); append-only; → InspectionSubmitted/Auditing |
| `submitAuditAttestation` | Auditor only; no transfers; Pass/Warning→ReadyForReview; ReviewRequired→ReviewRequired |
| `requestReweighing` | Lot producer; → ReweighingRequested |
| `acceptSettlement` | Producer; current version; attestation Pass/Warning; split sum == producer+association+platform; remaining ≥ total; → ProducerAccepted |
| `settleLot` | ProducerAccepted; transfer USDC splits to producer, association, and platform treasury; remaining -=; → Settled; order PartiallySettled/Completed |

## Events

`OrderCreated`, `OrderFunded`, `LotRegistered`, `InspectionReferenceSubmitted`, `AuditAttestationSubmitted`, `ReweighingRequested`, `SettlementAccepted`, `LotSettled`, `OrderCompleted`.

## Local verification

```bash
yarn chain          # Nitro
yarn deploy         # mock-usdc then alpacto-core
yarn phase1         # happy path
yarn phase1 -- --flow=reweigh
yarn stylus:test    # cargo tests in all crates
```

After deploy, ABIs and addresses land in `apps/web/contracts/deployedContracts.ts` (`yarn export-abi`). Admin reads Sepolia `alpacto-core` from there.
