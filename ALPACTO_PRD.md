# Alpacto — Product Requirements Document

**Versión:** 1.0  
**Estado:** listo para implementación  
**Producto:** Alpacto  
**Primer vertical:** fibra de alpaca  
**Agente:** Ayni Auditor  
**Red MVP:** Arbitrum Sepolia  
**Tagline:** *Un pacto justo por cada fibra.*

---

## 1. Resumen ejecutivo

Alpacto es una plataforma Web 2.5 para hacer más transparente y equilibrada la liquidación comercial de fibra de alpaca entre pequeños productores, asociaciones, inspectores y compradores.

El comprador asegura fondos antes del acopio. El inspector registra el peso y la clasificación del lote con evidencia. Ayni Auditor revisa de forma autónoma la consistencia de la evidencia, los documentos y los cálculos. El productor recibe una explicación sencilla, puede aceptar la liquidación o solicitar un nuevo pesaje, y el contrato ejecuta la distribución del pago únicamente cuando las reglas acordadas se cumplen.

El productor no necesita conocer criptomonedas, administrar una seed phrase, pagar gas ni usar MetaMask. Las cuentas embebidas, passkeys y operaciones patrocinadas se implementan con ZeroDev. La custodia, los estados, las attestations y la liquidación se ejecutan en Arbitrum mediante un contrato escrito en Rust con Stylus.

El MVP simula el puente fiat-cripto usando Stripe Sandbox: cuando Stripe confirma un pago de prueba, una tesorería prefondeada deposita el monto equivalente en USDC de testnet en el escrow. Este flujo debe etiquetarse siempre como simulación de conversión y no como un onramp real.

---

## 2. Problema

En una venta de fibra, el productor puede encontrarse en una posición desigual porque no controla completamente:

- El peso registrado.
- La calibración o identificación de la balanza.
- La clasificación de calidad.
- El precio por categoría.
- Las primas, comisiones y deducciones.
- La existencia real de fondos del comprador.
- El cálculo final de su liquidación.
- El historial de cambios o correcciones.

Una base de datos tradicional controlada por una sola parte puede registrar estos datos, pero no evita que esa parte los modifique unilateralmente ni prueba que el comprador aseguró el dinero antes de la aceptación del productor.

Alpacto no pretende que blockchain determine la verdad física. Su función es asegurar que cada declaración tenga autor, evidencia, versión, posibilidad de impugnación y consecuencias económicas que no puedan alterarse en secreto.

---

## 3. Visión del producto

### 3.1 Visión

Crear la infraestructura de liquidación justa para cadenas productivas de fibras naturales, comenzando por la fibra de alpaca peruana.

### 3.2 Propuesta de valor

> Alpacto protege el valor de la fibra desde el pesaje hasta el pago: el comprador asegura los fondos, Ayni Auditor revisa la evidencia y el productor acepta una liquidación transparente sin tener que entender criptomonedas.

### 3.3 Principio central

> La IA recomienda, las personas autorizadas deciden y el contrato ejecuta.

### 3.4 Diferenciación

Alpacto no es:

- Un marketplace de lana.
- Un NFT de alpaca.
- Un simple sistema de trazabilidad.
- Una wallet para productores.
- Un clasificador automático de fibra mediante fotografía.

Alpacto sí es:

- Un escrow comercial con condiciones previas y verificables.
- Un registro versionado de inspecciones y evidencias.
- Un mecanismo de consentimiento del productor.
- Una auditoría agéntica limitada y trazable.
- Una liquidación programable con una experiencia Web 2.5.

---

## 4. Objetivos del MVP

1. Demostrar un flujo completo desde financiamiento hasta liquidación.
2. Probar que un productor puede ejercer derechos onchain sin conocer Web3.
3. Detectar una inconsistencia realista entre el peso declarado y una fotografía de balanza.
4. Permitir un segundo pesaje y una liquidación corregida.
5. Registrar en Arbitrum la evidencia crítica, las attestations, el consentimiento y el settlement.
6. Mantener a Ayni Auditor sin autoridad para modificar mediciones o mover fondos.
7. Presentar una demo estable de cuatro a cinco minutos.

### 4.1 Métricas de éxito del MVP

- 100 % del flujo demo ejecutable desde una interfaz de usuario.
- Cero pasos que requieran MetaMask por parte del productor.
- Cero pagos de gas visibles para productor e inspector.
- Una inspección con discrepancia detectada correctamente.
- Una solicitud de nuevo pesaje registrada onchain.
- Una segunda inspección aceptada.
- Una liquidación de test USDC distribuida correctamente.
- Todas las acciones críticas visibles en una línea de tiempo verificable.
- El agente nunca puede invocar funciones financieras.

---

## 5. Alcance cerrado

### 5.1 Incluido

- Fibra de alpaca como único vertical.
- Cuatro roles operativos: comprador, asociación, inspector y productor.
- Un rol administrativo interno.
- Una campaña y una orden de compra.
- Precios por categoría, primas, comisiones y tolerancias.
- Stripe Checkout Sandbox.
- Webhook firmado e idempotente.
- Tesorería con USDC de Arbitrum Sepolia.
- Escrow en contrato Stylus.
- Smart accounts con ZeroDev.
- Passkeys.
- Gas patrocinado.
- Registro de lotes e inspecciones.
- Evidencias en almacenamiento S3-compatible.
- Ayni Auditor con DeepSeek como orquestador.
- OpenAI como herramienta visual/OCR.
- Cálculos deterministas fuera del LLM.
- Attestation onchain.
- Solicitud de nuevo pesaje.
- Aceptación del productor.
- Distribución de USDC de testnet.
- Adaptador de pago local simulado.
- Panel técnico de verificación.

### 5.2 Excluido

- Conversión real de fiat a cripto.
- Offramp real USDC-PEN.
- Integración real con Yape, Plin o bancos.
- Aplicación móvil nativa.
- Marketplace abierto.
- Vicuña, algodón, lana ovina u otros verticales.
- Hardware conectado a balanzas.
- Determinación automática de calidad mediante visión.
- DAO, token propio o NFTs.
- Créditos, seguros o factoring.
- Arbitraje complejo.
- Mainnet.
- KYC productivo.
- Cumplimiento regulatorio completo para operación comercial real.

---

## 6. Usuarios y roles

### 6.1 Productor

Necesita revisar su liquidación y proteger su derecho a cuestionarla.

Puede:

- Ingresar con autenticación sencilla.
- Ver precios y condiciones antes del pesaje.
- Revisar peso, categoría, primas y deducciones.
- Ver explicaciones de Ayni.
- Aceptar una liquidación.
- Solicitar un nuevo pesaje.
- Consultar evidencias.
- Confirmar recepción de un pago local simulado.

No puede:

- Cambiar una inspección.
- Alterar precios.
- Liberar fondos sin cumplir el flujo.

### 6.2 Inspector

Registra mediciones y adjunta evidencia.

Puede:

- Ver lotes asignados.
- Registrar peso en gramos.
- Seleccionar una categoría.
- Subir fotografía de balanza.
- Subir ficha de clasificación.
- Firmar una inspección con passkey.
- Crear una inspección revisada.

No puede:

- Sobrescribir versiones previas.
- Modificar precios.
- Aprobar en nombre del productor.

### 6.3 Asociación

Coordina la campaña y los actores locales.

Puede:

- Registrar productores.
- Autorizar inspectores.
- Crear campañas.
- Gestionar lotes.
- Revisar reclamos.
- Consultar fondos y liquidaciones.
- Registrar el estado del pago local simulado.

### 6.4 Comprador

Define y financia la orden.

Puede:

- Crear una orden.
- Definir precios por categoría.
- Definir primas, comisión y tolerancia.
- Financiar mediante Stripe Sandbox.
- Consultar fondos en escrow.
- Revisar lotes y settlements.

No puede:

- Retirar unilateralmente fondos ya comprometidos a un lote aceptado.
- Modificar precios de una orden financiada.

### 6.5 Administrador de plataforma

Puede:

- Autorizar organizaciones.
- Suspender usuarios.
- Configurar contratos y redes permitidas.
- Gestionar tesorería y límites de demo.
- Revocar la session key de Ayni.
- Reintentar jobs fallidos.

---

## 7. Principios de UX

1. **Blockchain invisible:** no mostrar wallets, gas, ETH o direcciones `0x` en el flujo principal del productor.
2. **Montos en soles:** el productor ve PEN; la equivalencia USDC aparece solo en detalle técnico.
3. **Consentimiento explícito:** aceptar una liquidación requiere una acción deliberada y autenticación fuerte.
4. **Explicación antes que jerga:** cada comisión o alerta debe tener una explicación sencilla.
5. **No falsa certeza:** Ayni no afirma que una foto prueba la calidad física; solo revisa consistencia documental y visual.
6. **Evidencia accesible:** el usuario puede abrir la foto, ficha y versión asociada.
7. **Errores recuperables:** si una transacción falla, la interfaz conserva el estado y permite reintentar sin duplicar.
8. **Accesibilidad móvil:** el flujo del productor debe funcionar correctamente desde una pantalla pequeña.

---

## 8. Flujo end-to-end del MVP

### 8.1 Preparación

- Existe una campaña activa.
- Existe una orden por USD 1,000.
- La tesorería tiene al menos 1,000 test USDC.
- Productor, inspector, asociación y comprador tienen cuentas precargadas.
- El comprador tiene una smart account o wallet de prueba.
- Productor e inspector usan passkeys.

### 8.2 Financiamiento

1. El comprador abre la orden.
2. Pulsa `Financiar orden`.
3. El backend crea una Stripe Checkout Session.
4. El comprador completa el pago de prueba.
5. Stripe envía `checkout.session.completed`.
6. El backend verifica firma e idempotencia.
7. Se crea un job de fondeo.
8. La tesorería deposita 1,000 test USDC directamente en el escrow.
9. La orden pasa a `FUNDED`.
10. La UI muestra `Fondos asegurados`.

### 8.3 Primera inspección

1. El inspector abre un lote.
2. Declara `42.5 kg` y categoría `FINE`.
3. Sube una fotografía donde la balanza muestra `41.5 kg`.
4. Sube una ficha de clasificación.
5. Firma con passkey.
6. Se crea una nueva versión de inspección.
7. El hash de evidencia se registra onchain.
8. El lote pasa a `AUDITING`.

### 8.4 Auditoría de Ayni

1. El worker recibe el job.
2. DeepSeek solicita el contexto del lote.
3. Invoca la herramienta visual de balanza.
4. OpenAI extrae `41.5 kg` con salida estructurada.
5. Invoca la herramienta de documento.
6. Invoca el cálculo determinista.
7. Invoca la comparación determinista.
8. Detecta `WEIGHT_MISMATCH`.
9. Genera reporte completo fuera de la cadena.
10. Calcula `reportHash`.
11. Registra una attestation `REVIEW_REQUIRED` mediante ZeroDev.
12. El lote pasa a `REVIEW_REQUIRED`.

### 8.5 Decisión del productor

1. El productor recibe una notificación.
2. Ve peso declarado, peso observado y diferencia monetaria.
3. Ayni explica la inconsistencia.
4. El productor pulsa `Solicitar nuevo pesaje`.
5. Confirma con passkey.
6. ZeroDev patrocina la operación.
7. El contrato registra la solicitud.
8. El lote pasa a `REWEIGHING_REQUESTED`.

### 8.6 Segunda inspección

1. El inspector registra `41.6 kg`.
2. Sube una nueva evidencia.
3. Se crea una nueva versión; la anterior no se modifica.
4. Ayni vuelve a auditar.
5. La diferencia con la evidencia es menor o igual a la tolerancia.
6. La attestation queda en `PASS`.
7. El lote pasa a `READY_FOR_REVIEW`.

### 8.7 Aceptación y settlement

1. El productor revisa el cálculo final.
2. Ve el monto final en PEN.
3. Pulsa `Aceptar liquidación`.
4. Confirma mediante passkey.
5. El contrato valida versión, attestation y saldo.
6. El contrato distribuye test USDC entre la cuenta embebida del productor y la asociación.
7. El lote pasa a `SETTLED`.
8. El adaptador local de pagos marca una transferencia PEN simulada.
9. La interfaz muestra la operación como simulación.

---

## 9. Estados

### 9.1 Orden

```text
DRAFT
  -> PAYMENT_PENDING
  -> PAYMENT_CONFIRMED
  -> ONCHAIN_FUNDING_PENDING
  -> FUNDED
  -> ACCEPTING_LOTS
  -> PARTIALLY_SETTLED
  -> COMPLETED
```

Estados alternativos:

```text
PAYMENT_FAILED
ONCHAIN_FUNDING_FAILED
CANCELLED
EXPIRED
```

### 9.2 Lote

```text
REGISTERED
  -> INSPECTION_SUBMITTED
  -> AUDITING
  -> READY_FOR_REVIEW
  -> PRODUCER_ACCEPTED
  -> SETTLED
```

Rama de revisión:

```text
AUDITING
  -> REVIEW_REQUIRED
  -> REWEIGHING_REQUESTED
  -> REVISED_INSPECTION
  -> AUDITING
```

Estados alternativos:

```text
PRODUCER_REJECTED
DISPUTED
CANCELLED
```

### 9.3 Auditoría

```text
QUEUED
  -> RUNNING
  -> PASS | WARNING | REVIEW_REQUIRED | UNREADABLE
  -> ATTESTATION_PENDING
  -> ATTESTED
```

---

## 10. Stack técnico

### 10.1 Base

- Scaffold-Stylus generado con `create-stylus`.
- Workspace dentro de Ubuntu WSL2.
- Docker Desktop como único motor, integrado con WSL2.
- El repositorio debe vivir en `~/projects/alpacto`, no en `/mnt/c/...`.

### 10.2 Frontend

- Next.js con App Router.
- React.
- TypeScript estricto.
- Tailwind CSS.
- shadcn/ui.
- React Icons.
- Viem para lecturas técnicas.
- ZeroDev SDK para smart accounts y passkeys.

### 10.3 Backend

- Fastify.
- TypeScript.
- Drizzle ORM.
- PostgreSQL.
- Redis + BullMQ para jobs.
- Almacenamiento S3-compatible; MinIO local.
- Stripe SDK.
- Viem.
- ZeroDev SDK.

### 10.4 Agente

- DeepSeek V4 Flash como orquestador configurable por variable de entorno.
- Tool calling con un conjunto cerrado de herramientas.
- OpenAI multimodal como herramienta visual/OCR.
- Zod/JSON Schema para inputs y outputs.
- Cálculos financieros en código determinista.

### 10.5 Blockchain

- Arbitrum Sepolia.
- Rust.
- Stylus SDK.
- USDC oficial de testnet configurado por environment.
- ZeroDev Kernel Smart Accounts.
- Paymaster para gas patrocinado.
- Session key limitada para Ayni.

---

## 11. Arquitectura

```text
apps/web
   |
   | HTTPS
   v
apps/api -------------------- PostgreSQL
   |                              |
   |                              +-- estado Web2 y PII
   |
   +-------------------------- Object Storage
   |                              +-- fotos, fichas y reportes
   |
   +-------------------------- Redis/BullMQ
   |                              |
   |                              v
   |                         apps/ayni-worker
   |                              |
   |                              +-- DeepSeek
   |                              +-- OpenAI vision tool
   |                              +-- deterministic tools
   |
   +-------------------------- Stripe Sandbox
   |
   +-------------------------- ZeroDev
   |                              |
   v                              v
packages/contracts ---------- Arbitrum Sepolia
   +-- AlpactoCore             +-- escrow
                               +-- attestations
                               +-- settlements
```

---

## 12. Estructura del monorepo

```text
alpacto/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── buyer/
│   │   │   ├── association/
│   │   │   ├── inspector/
│   │   │   ├── producer/
│   │   │   ├── admin/
│   │   │   └── debug/
│   │   ├── components/
│   │   └── lib/
│   ├── api/
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── organizations/
│   │       │   ├── campaigns/
│   │       │   ├── orders/
│   │       │   ├── lots/
│   │       │   ├── inspections/
│   │       │   ├── evidence/
│   │       │   ├── audits/
│   │       │   ├── settlements/
│   │       │   ├── funding/
│   │       │   ├── payouts/
│   │       │   └── blockchain/
│   │       ├── jobs/
│   │       └── server.ts
│   └── ayni-worker/
│       └── src/
│           ├── agent/
│           ├── tools/
│           ├── policies/
│           ├── prompts/
│           ├── schemas/
│           └── worker.ts
├── packages/
│   ├── contracts/
│   │   └── alpacto-core/
│   ├── contract-client/
│   ├── contract-abi/
│   ├── database/
│   ├── domain/
│   ├── shared-schemas/
│   ├── ui/
│   ├── zero-dev/
│   └── config/
├── infra/
│   ├── docker/
│   ├── deployment/
│   └── scripts/
├── docs/
│   ├── architecture.md
│   ├── demo-script.md
│   ├── contract-spec.md
│   ├── agent-security.md
│   └── threat-model.md
└── README.md
```

---

## 13. Modelo de datos

Todas las cantidades monetarias deben almacenarse como enteros.

- PEN: centavos.
- USD Stripe: centavos.
- USDC: unidades de 6 decimales.
- Peso: gramos.
- Tipo de cambio: micros de PEN por USDC.

### 13.1 Tablas principales

#### `users`

- `id`
- `role`
- `name`
- `phone`
- `email`
- `status`
- `smart_account_address`
- `created_at`
- `updated_at`

#### `organizations`

- `id`
- `name`
- `type`
- `status`
- `created_at`

#### `organization_members`

- `organization_id`
- `user_id`
- `member_role`

#### `campaigns`

- `id`
- `organization_id`
- `buyer_id`
- `name`
- `start_date`
- `end_date`
- `status`
- `pricing_policy_id`

#### `pricing_policies`

- `id`
- `version`
- `currency`
- `association_fee_bps`
- `weight_tolerance_bps`
- `pen_per_usdc_micros`
- `policy_hash`
- `locked_at`

#### `pricing_categories`

- `pricing_policy_id`
- `code`
- `label`
- `price_pen_minor_per_kg`
- `quality_bonus_pen_minor_per_kg`

#### `orders`

- `id`
- `onchain_order_id`
- `campaign_id`
- `buyer_id`
- `association_id`
- `budget_usd_cents`
- `funded_usdc_units`
- `remaining_usdc_units`
- `status`
- `tx_hash`

#### `funding_intents`

- `id`
- `order_id`
- `stripe_session_id`
- `stripe_payment_intent_id`
- `stripe_event_id`
- `usd_cents`
- `usdc_units`
- `payment_reference_hash`
- `status`
- `funding_tx_hash`

Restricciones únicas:

- `stripe_session_id`
- `stripe_payment_intent_id`
- `stripe_event_id`
- `payment_reference_hash`

#### `lots`

- `id`
- `onchain_lot_id`
- `order_id`
- `producer_id`
- `status`
- `current_inspection_version`
- `accepted_inspection_version`
- `created_at`

#### `inspections`

- `id`
- `lot_id`
- `version`
- `inspector_id`
- `weight_grams`
- `category_code`
- `evidence_bundle_hash`
- `status`
- `submitted_at`
- `onchain_tx_hash`

Restricción única:

- `(lot_id, version)`

#### `evidence_files`

- `id`
- `inspection_id`
- `type`
- `storage_key`
- `sha256`
- `mime_type`
- `size_bytes`
- `created_at`

#### `audit_runs`

- `id`
- `lot_id`
- `inspection_version`
- `status`
- `provider`
- `model_alias`
- `prompt_version`
- `result_code`
- `report_storage_key`
- `report_hash`
- `onchain_tx_hash`
- `started_at`
- `completed_at`

#### `audit_findings`

- `id`
- `audit_run_id`
- `code`
- `severity`
- `declared_value`
- `observed_value`
- `explanation`

#### `settlements`

- `id`
- `lot_id`
- `inspection_version`
- `weight_grams`
- `category_code`
- `gross_pen_minor`
- `bonus_pen_minor`
- `fee_pen_minor`
- `net_pen_minor`
- `producer_usdc_units`
- `association_usdc_units`
- `quote_hash`
- `status`
- `accepted_at`
- `settled_at`
- `settlement_tx_hash`

#### `reweigh_requests`

- `id`
- `lot_id`
- `requested_by`
- `reason_code`
- `reason_text`
- `onchain_tx_hash`
- `created_at`

#### `local_payouts`

- `id`
- `settlement_id`
- `provider`
- `is_simulation`
- `amount_pen_minor`
- `status`
- `reference`
- `created_at`

---

## 14. Contrato Stylus: `AlpactoCore`

### 14.1 Responsabilidades

- Roles y permisos.
- Órdenes.
- Escrow de USDC.
- Política de precios bloqueada mediante hash.
- Lotes.
- Referencias de inspección.
- Attestations de Ayni.
- Solicitudes de nuevo pesaje.
- Aceptación del productor.
- Liquidación y split.
- Eventos de auditoría.

### 14.2 Roles

- `DEFAULT_ADMIN_ROLE`
- `PLATFORM_ADMIN_ROLE`
- `ASSOCIATION_ROLE`
- `BUYER_ROLE`
- `INSPECTOR_ROLE`
- `AUDITOR_AGENT_ROLE`

### 14.3 Enums

```rust
OrderStatus {
    Draft,
    Funded,
    AcceptingLots,
    PartiallySettled,
    Completed,
    Cancelled,
}

LotStatus {
    Registered,
    InspectionSubmitted,
    Auditing,
    ReadyForReview,
    ReviewRequired,
    ReweighingRequested,
    ProducerAccepted,
    Settled,
    Cancelled,
}

AuditResult {
    Pass,
    Warning,
    ReviewRequired,
    Unreadable,
}
```

### 14.4 Funciones públicas mínimas

```text
createOrder(...)
fundOrder(orderId, amount, paymentReferenceHash)
registerLot(orderId, lotId, producerAccount)
submitInspectionReference(lotId, version, weightGrams, categoryCode, evidenceHash)
submitAuditAttestation(lotId, version, reportHash, result)
requestReweighing(lotId, reasonHash)
acceptSettlement(lotId, version, quoteHash, netPenMinor, producerUsdcUnits, associationUsdcUnits)
settleLot(lotId)
getOrder(orderId)
getLot(lotId)
getAuditAttestation(lotId, version)
```

### 14.5 Reglas

- Una orden financiada no puede cambiar su `pricingPolicyHash`.
- Un `paymentReferenceHash` solo puede procesarse una vez.
- Una inspección no puede sobrescribirse; solo crear una versión superior.
- Ayni solo puede registrar attestations.
- Ayni no puede transferir tokens.
- El productor solo puede aceptar la versión vigente.
- No se puede liquidar sin attestation `Pass` o `Warning` aceptable.
- Un lote con `ReviewRequired` debe pasar por nueva inspección o una resolución humana explícita fuera del MVP.
- El contrato valida que la suma de los splits coincida con el settlement.
- El saldo restante de la orden nunca puede quedar negativo.
- Todas las cantidades usan enteros.

### 14.6 Eventos

```text
OrderCreated
OrderFunded
LotRegistered
InspectionReferenceSubmitted
AuditAttestationSubmitted
ReweighingRequested
SettlementAccepted
LotSettled
OrderCompleted
```

---

## 15. ZeroDev

### 15.1 Productor e inspector

- Smart account embebida.
- Acceso con passkey.
- Gas patrocinado.
- Sin MetaMask en el flujo principal.

### 15.2 Ayni Auditor

Debe usar una smart account separada con session key restringida.

Permisos:

- Red: Arbitrum Sepolia.
- Contrato: únicamente `AlpactoCore`.
- Función: únicamente `submitAuditAttestation`.
- Sin transferencias de ETH o ERC-20.
- Vigencia limitada.
- Revocación desde panel administrativo.
- Límite de operaciones configurable.

El contrato también debe validar `AUDITOR_AGENT_ROLE`. La política de ZeroDev no sustituye el control de acceso onchain.

---

## 16. Ayni Auditor

### 16.1 Responsabilidad

Ayni revisa consistencia, no determina la verdad absoluta ni toma decisiones económicas finales.

### 16.2 LLM orquestador

DeepSeek V4 Flash controla las herramientas. Debe estar encapsulado detrás de un adapter para poder sustituir el proveedor sin reescribir el dominio.

### 16.3 Herramientas permitidas

#### `get_audit_context`

Devuelve:

- Lote.
- Orden.
- Política de precios.
- Inspector.
- Evidencias.
- Inspecciones anteriores.
- Estado onchain.

#### `extract_scale_evidence`

Implementada con OpenAI multimodal.

Salida mínima:

```json
{
  "readingDetected": true,
  "weightValueKg": 41.5,
  "weightUnit": "kg",
  "displayReadable": true,
  "confidence": 0.94,
  "warnings": []
}
```

#### `extract_classification_document`

Salida mínima:

```json
{
  "documentReadable": true,
  "lotReference": "LOT-014",
  "classification": "FINE",
  "inspectorName": "Demo Inspector",
  "inspectionDate": "2026-08-01",
  "confidence": 0.91,
  "missingFields": []
}
```

#### `calculate_settlement`

Código determinista.

```text
pago bruto = peso aceptado * precio por categoría
pago final = pago bruto + primas - comisión - deducciones autorizadas
```

No usar `float`.

#### `compare_audit_values`

Compara:

- Peso declarado vs. observado.
- Categoría declarada vs. documento.
- Código de lote.
- Fecha.
- Inspector.
- Integridad del cálculo.

#### `create_audit_report`

- Persiste el reporte completo.
- Genera hash.
- Relaciona `evidenceVersion`, `pricingVersion` y `promptVersion`.

#### `submit_audit_attestation`

- Usa ZeroDev.
- Solo puede registrar la attestation.
- Nunca puede mover fondos.

### 16.4 Resultados

- `PASS`
- `WARNING`
- `REVIEW_REQUIRED`
- `UNREADABLE`

### 16.5 Política de discrepancia

Default del MVP:

- Diferencia de peso mayor al 1 %: `REVIEW_REQUIRED`.
- Evidencia ilegible: `UNREADABLE`.
- Cálculo incorrecto: `REVIEW_REQUIRED`.
- Documento faltante: `WARNING` o `REVIEW_REQUIRED` según configuración.

### 16.6 Privacidad

Antes de enviar una imagen a OpenAI:

- Validar MIME y tamaño.
- Eliminar EXIF.
- Recortar el área útil cuando sea posible.
- Ocultar PII no necesaria.
- Calcular hash.
- No enviar DNI, teléfono ni cuenta bancaria.

---

## 17. Financiamiento Stripe Sandbox

### 17.1 Comportamiento

Stripe simula el pago fiat. No convierte realmente USD a USDC.

### 17.2 Flujo

1. Crear `FundingIntent`.
2. Crear Checkout Session.
3. Recibir webhook.
4. Verificar `Stripe-Signature`.
5. Comprobar `payment_status == paid`.
6. Comprobar idempotencia.
7. Encolar `fund-order`.
8. Tesorería transfiere test USDC al escrow.
9. Guardar hash de transacción.
10. Marcar orden como `FUNDED`.

### 17.3 Seguridad

- No confiar en la página de `success_url`.
- No permitir que el cliente indique una dirección arbitraria de destino.
- El destino se obtiene desde la orden registrada.
- Máximo por demo configurable.
- Reintentar solo el fondeo onchain, nunca el cobro Stripe.
- Guardar el identificador Stripe real offchain y solo un hash onchain.

---

## 18. API mínima

### Auth

```text
POST /auth/passkey/register/options
POST /auth/passkey/register/verify
POST /auth/passkey/login/options
POST /auth/passkey/login/verify
POST /auth/demo-login
```

### Orders

```text
POST /orders
GET  /orders/:id
POST /orders/:id/funding-session
GET  /orders/:id/funding-status
```

### Stripe

```text
POST /webhooks/stripe
```

### Lots

```text
POST /lots
GET  /lots/:id
GET  /lots/:id/timeline
```

### Inspections

```text
POST /lots/:id/inspections
POST /lots/:id/reweigh-request
GET  /lots/:id/inspections
```

### Evidence

```text
POST /evidence/upload-url
GET  /evidence/:id
```

### Audits

```text
POST /lots/:id/audits
GET  /lots/:id/audits/latest
GET  /audits/:id
```

### Settlements

```text
GET  /lots/:id/settlement-preview
POST /lots/:id/settlement/accept
GET  /lots/:id/settlement
```

### Admin

```text
POST /admin/inspectors/:id/suspend
POST /admin/ayni/session-key/revoke
POST /admin/jobs/:id/retry
GET  /admin/treasury
```

---

## 19. Pantallas

### 19.1 Productor

#### `/producer`

- Campaña activa.
- Lotes.
- Estado.
- Pago estimado.

#### `/producer/lots/:id`

- Peso.
- Categoría.
- Precio.
- Prima.
- Comisión.
- Total.
- Evidencias.
- Resultado de Ayni.
- Botones `Aceptar` y `Solicitar nuevo pesaje`.

#### `/producer/lots/:id/settlement`

- Resumen final.
- Confirmación con passkey.
- Estado del pago local simulado.

### 19.2 Inspector

#### `/inspector`

- Lotes pendientes.
- Solicitudes de revisión.

#### `/inspector/lots/:id/inspect`

- Peso.
- Categoría.
- Carga de fotos y ficha.
- Firma con passkey.

### 19.3 Asociación

#### `/association`

- Campañas.
- Fondos.
- Lotes por estado.
- Reclamos.
- Liquidaciones.

### 19.4 Comprador

#### `/buyer/orders`

- Órdenes.
- Presupuesto.
- Estado de fondeo.

#### `/buyer/orders/:id`

- Tabla de precios.
- Fondos en escrow.
- Lotes.
- Botón `Financiar orden`.

### 19.5 Admin

#### `/admin`

- Tesorería.
- Jobs.
- Usuarios.
- Session key de Ayni.
- Contratos.

### 19.6 Debug

#### `/debug`

Conservar las utilidades de Scaffold-Stylus para:

- Leer estado.
- Ejecutar funciones de desarrollo.
- Ver eventos.
- Ver direcciones.

No debe estar enlazado desde la navegación principal.

---

## 20. Criterios de aceptación por épica

### Épica A — Scaffold y contrato básico

- El Nitro devnode levanta correctamente.
- El contrato de ejemplo compila y despliega.
- Se exporta ABI.
- El frontend puede leer y escribir.
- Luego se reemplaza por `AlpactoCore`.

### Épica B — Identidad Web 2.5

- Productor e inspector pueden registrarse con passkey.
- Se crea smart account.
- Una operación patrocinada funciona.
- No aparece MetaMask en esos flujos.

### Épica C — Orden y fondeo

- El comprador crea una orden.
- Stripe Sandbox completa pago.
- El webhook es firmado e idempotente.
- La tesorería deposita test USDC.
- La UI muestra hash y saldo.

### Épica D — Inspección

- El inspector registra peso y categoría.
- Las evidencias se almacenan fuera de la cadena.
- El hash se registra onchain.
- Una segunda inspección crea nueva versión.

### Épica E — Ayni

- DeepSeek controla tools cerradas.
- OpenAI extrae datos estructurados.
- El cálculo se ejecuta en código.
- Se detecta 42.5 vs. 41.5 kg.
- Se genera reporte.
- Se registra attestation onchain.
- El agente no puede mover fondos.

### Épica F — Revisión y aceptación

- El productor ve explicación comprensible.
- Puede solicitar nuevo pesaje.
- La solicitud queda onchain.
- Puede aceptar solo una versión auditada válida.

### Épica G — Settlement

- El contrato distribuye test USDC.
- La suma de splits es correcta.
- El lote queda `SETTLED`.
- La interfaz muestra payout local como simulación.

---

## 21. Pruebas

### 21.1 Contrato

- Roles.
- Doble fondeo.
- Reutilización de `paymentReferenceHash`.
- Versiones de inspección.
- Attestation no autorizada.
- Ayni intentando transferir tokens.
- Aceptación de versión antigua.
- Settlement sin saldo.
- Split incorrecto.
- Settlement duplicado.

### 21.2 Backend

- Firma de Stripe inválida.
- Webhook duplicado.
- Job fallido y reintento.
- Upload inválido.
- Cálculo con enteros.
- Conversión PEN-USDC.
- Conciliación DB-chain.

### 21.3 Agente

- Balanza legible y coincidente.
- Balanza legible con discrepancia.
- Imagen ilegible.
- Documento faltante.
- Tool call inválida.
- Intento de invocar función financiera.
- Cambio de evidencia durante auditoría.

### 21.4 E2E

- Flujo completo exitoso.
- Flujo con segundo pesaje.
- Fondeo Stripe seguido de fallo RPC y reintento.
- Passkey + gas patrocinado.

---

## 22. Seguridad y amenazas

### 22.1 Principales riesgos

- Inspector deshonesto.
- Foto reutilizada.
- Balanza incorrecta.
- Webhook duplicado.
- Treasury drain.
- Session key excesiva.
- Prompt injection en documentos.
- Manipulación del resultado del agente.
- Exposición de PII.
- Inconsistencia DB-chain.

### 22.2 Controles

- Versionado inmutable de inspecciones.
- Hashes de evidencia.
- Inspector autorizado.
- Confirmación del productor.
- Segundo pesaje.
- Tool schemas cerrados.
- Documentos tratados como datos, no instrucciones.
- Cálculos deterministas.
- Session key restringida.
- Roles también en contrato.
- Límites de tesorería.
- Idempotencia.
- Logs de auditoría.
- Secretos fuera del repositorio.
- PII solo offchain.

---

## 23. Datos seed para la demo

### Usuarios

- Productora: Martina Quispe.
- Inspector: Carlos Huamán.
- Asociación: Asociación AlpaSur.
- Comprador: Andes Textile Import LLC.
- Admin: Alpacto Demo Admin.

### Orden

- ID: `ALP-2026-001`.
- Presupuesto: USD 1,000.
- Equivalente demo: 1,000 test USDC.
- Tipo de cambio fijo de demo: configurable.
- Comisión de asociación: 3 %.
- Tolerancia de peso: 1 %.

### Categoría

- `FINE`.
- Precio: S/ 27.50 por kg.
- Prima fija demo opcional.

### Inspecciones

- Primera declaración: 42.5 kg.
- Primera fotografía: 41.5 kg.
- Segunda declaración: 41.6 kg.
- Segunda fotografía: 41.6 kg.

---

## 24. Variables de entorno

```text
# App
NODE_ENV=
APP_URL=
API_URL=

# Database
DATABASE_URL=
REDIS_URL=

# Storage
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_MODE=demo

# Chain
CHAIN_ID=
ARBITRUM_RPC_URL=
ALPACTO_CONTRACT_ADDRESS=
USDC_TOKEN_ADDRESS=
TREASURY_PRIVATE_KEY=

# ZeroDev
ZERODEV_PROJECT_ID=
ZERODEV_BUNDLER_RPC=
ZERODEV_PAYMASTER_RPC=
AYNI_SESSION_KEY=

# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=

# OpenAI
OPENAI_API_KEY=
OPENAI_VISION_MODEL=

# Demo
DEMO_MAX_FUNDING_USDC=
DEMO_PEN_PER_USDC_MICROS=
DEMO_LOCAL_PAYOUT_ENABLED=true
```

No guardar secretos en `.env.example`.

---

## 25. Fases de implementación

### Fase 0 — Bootstrap

1. Generar proyecto con Scaffold-Stylus.
2. Ejecutar scaffold sin modificaciones.
3. Levantar Nitro devnode.
4. Compilar y desplegar contrato ejemplo.
5. Confirmar lectura/escritura desde frontend.
6. Crear monorepo final.

**Checkpoint:** pipeline Rust -> WASM -> deploy -> ABI -> frontend funcionando.

### Fase 1 — Dominio y contrato

1. Implementar roles.
2. Crear orden.
3. Fondear escrow.
4. Registrar lote.
5. Registrar inspección.
6. Registrar attestation.
7. Aceptar settlement.
8. Liquidar.
9. Tests del contrato.

**Checkpoint:** flujo onchain completo con scripts y wallet de desarrollo.

### Fase 2 — Backend y DB

1. Drizzle schemas.
2. Migrations.
3. Seed.
4. APIs de campañas, órdenes, lotes e inspecciones.
5. Storage.
6. Jobs.

**Checkpoint:** flujo sin IA y sin ZeroDev, operable por API.

### Fase 3 — ZeroDev

1. Smart accounts.
2. Passkeys.
3. Paymaster.
4. Productor e inspector.
5. Session key de Ayni.

**Checkpoint:** productor solicita revisión sin MetaMask ni gas.

### Fase 4 — Stripe

1. Checkout Session.
2. Webhook.
3. Idempotencia.
4. Worker de fondeo.
5. Conciliación.

**Checkpoint:** USD de prueba -> test USDC en escrow.

### Fase 5 — Ayni

1. Adapter DeepSeek.
2. Tool runtime.
3. OpenAI vision tools.
4. Cálculo determinista.
5. Comparación.
6. Reporte.
7. Attestation.

**Checkpoint:** detecta la discrepancia y bloquea el flujo normal.

### Fase 6 — UX y demo

1. Pantallas por rol.
2. Timeline.
3. Mobile producer view.
4. Estados de carga y error.
5. Adaptador local simulado.
6. Video de respaldo.
7. Guion de cinco minutos.

**Checkpoint:** demo reproducible de inicio a fin.

---

## 26. Reglas para Cursor

1. No reestructurar Scaffold-Stylus antes de comprobarlo intacto.
2. No actualizar dependencias sin necesidad.
3. No reemplazar Yarn hasta cerrar el MVP.
4. No introducir microservicios.
5. No añadir NFTs, token o DAO.
6. No permitir al LLM calcular dinero.
7. No guardar PII onchain.
8. No sobrescribir inspecciones.
9. No confiar solo en el frontend para permisos.
10. No presentar Stripe Sandbox como conversión real.
11. No presentar OCR como medición oficial.
12. Cada fase debe incluir tests y un checkpoint verificable.
13. Mantener un `DECISIONS.md` con decisiones técnicas relevantes.
14. Mantener `docs/demo-script.md` actualizado.
15. Crear commits pequeños por épica.

---

## 27. Definición de terminado

El MVP se considera terminado cuando:

- Un comprador financia una orden con Stripe Sandbox.
- El escrow recibe test USDC en Arbitrum Sepolia.
- Un inspector registra una inspección mediante passkey.
- Ayni detecta una discrepancia usando OpenAI como tool.
- Ayni registra una attestation con permisos limitados.
- El productor solicita un segundo pesaje sin MetaMask ni gas.
- El inspector registra una nueva versión.
- Ayni aprueba la nueva evidencia.
- El productor acepta la liquidación.
- El contrato distribuye test USDC.
- La línea de tiempo muestra todos los eventos.
- El payout PEN aparece claramente como simulación.
- Los tests críticos pasan.
- Existe un video de respaldo.
- El README permite ejecutar el proyecto desde cero.

---

## 28. Roadmap posterior

- Offramp regulado USDC-PEN.
- Integración con balanzas digitales.
- Clasificación por laboratorios.
- Vicuña y chaccus autorizados.
- Lana ovina y algodón.
- Órdenes colectivas de textiles terminados.
- Reputación de inspectores.
- Auditoría multiagente.
- Pagos internacionales productivos.
- Integraciones con cooperativas y exportadores.

---

## 29. Pitch de una frase

> Alpacto permite que un comprador asegure los fondos, que cada pesaje tenga evidencia y responsable, y que el productor revise y acepte su pago antes de transferir su fibra; Arbitrum ejecuta las reglas, ZeroDev oculta la complejidad cripto y Ayni Auditor detecta inconsistencias sin controlar el dinero.


## 30. Repositorio

https://github.com/hallzyx/alpacto
