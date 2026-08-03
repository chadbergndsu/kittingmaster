# KittingMaster — Design Specification

**Date:** 2026-08-01  
**Status:** Approved for implementation planning  
**Product:** KittingMaster  
**Audience:** Manufacturing, assembly, and fulfillment businesses

---

## 1. Vision

KittingMaster is a multi-tenant, multi-site production foundation that helps companies **stage and kit components** for assembly work orders and fulfillment orders under one unified kit engine.

Differentiation is not cosmetic. Every workflow surface is designed around **custom intellectual property (IP)**:

1. **Platform IP** — proprietary dual-ledger inventory, Kit Seal validation, and scan-order state machines that competitors do not get by default in generic WMS/MES tools.
2. **Customer Method DNA** — each tenant owns configurable, versioned, exportable method packs that define _how_ they pick, stage, validate, seal, and document kits. DNA is isolated; no cross-tenant leakage.
3. **Senior-engineering bar** — typed domain model, transactional inventory, full audit, multi-tenant RLS, real-time status, and testable pure strategy modules.

---

## 2. Goals & Non-Goals

### 2.1 Goals (Foundation / v1)

- Multi-tenant SaaS with multi-site plants/warehouses
- Unified kit model for **assembly jobs** and **fulfillment orders**
- Dual-ledger inventory: **raw components** vs **sealed kits**
- Location staging (site → zone → bin / staging cell)
- Full **lot + serial** tracking where parts require it
- Barcode / simple scanning workflows (keyboard wedge + camera-friendly mobile)
- Pick lists and kit sheets (print + PDF)
- Real-time kit status: `pending` → `allocated` → `picking` → `staged` → `validating` → `sealed` → `released` | `cancelled`
- Customer Method DNA: pluggable strategies per tenant (and optional site overrides)
- Kit Seal: completeness fingerprint over BOM + qty + lot + serial + staging cell + DNA version
- Role-based access: admin, planner, picker/stager, supervisor, viewer

### 2.2 Non-Goals (v1)

- Full ERP (GL, purchasing, payroll)
- Advanced wave optimization / AI pathing (interface reserved; heuristic packer only)
- RFID / fixed industrial scanner firmware (browser + wedge first)
- Native mobile apps (responsive PWA-style web first)
- Customer-authored arbitrary code (strategies are config + registered platform modules, not eval)
- Multi-currency billing / Stripe packaging (auth + tenancy first; commercial later)

---

## 3. Design Principles

1. **IP by default** — every customer gets a Method DNA profile at onboarding; defaults are product IP, overrides are their IP.
2. **Isolation** — tenant data and DNA never leak; DNA versions are immutable once used on a sealed kit.
3. **One kit engine** — assembly and fulfillment share lifecycle; demand type only changes origin and release target.
4. **Ledger honesty** — stock never “disappears”; every move is a typed inventory transaction.
5. **Scan grammar** — validation is not only _what_ was scanned but _in what legal sequence_.
6. **Pure strategies** — Method DNA handlers are pure functions over domain events; easy to unit test and patent-document.
7. **Foundation, not prototype** — Postgres, migrations, RLS, audit, seed data, CI-ready structure.

---

## 4. Architecture

### 4.1 Stack

| Layer         | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| App           | Next.js (App Router) + TypeScript                                       |
| API           | Next.js Route Handlers + server actions for mutations where appropriate |
| DB            | PostgreSQL                                                              |
| ORM           | Prisma                                                                  |
| Auth          | Session-based (e.g. Auth.js / NextAuth) with org membership             |
| Real-time     | Server-Sent Events (SSE) per site/kit channel                           |
| Validation    | Zod on all boundaries                                                   |
| PDF           | Server-side generation (e.g. `@react-pdf/renderer` or similar)          |
| Deploy target | Standard Node host (Vercel or container); Postgres managed              |

### 4.2 High-level modules

```
apps/web (Next.js)
  ├── app/                    # routes: dashboard, kits, scan, inventory, dna, docs
  ├── components/
  └── lib/
      ├── auth/
      ├── db/                 # Prisma client, tenant helpers
      ├── domain/             # pure domain types & rules
      ├── inventory/          # dual-ledger engine
      ├── seal/               # Kit Seal fingerprint
      ├── dna/                # Method DNA registry & resolution
      ├── scan/               # scan grammar state machine
      ├── documents/          # pick list / kit sheet
      └── realtime/           # SSE publishers

packages/ (optional later)
  └── method-strategies/      # versioned strategy implementations
```

### 4.3 Multi-tenancy

- `Organization` = tenant (company)
- `Site` = plant/warehouse under org
- All business tables carry `organizationId`; site-scoped tables also carry `siteId`
- Prisma middleware / query helpers inject tenant filters
- Postgres **Row Level Security** as defense in depth (session `app.organization_id`)
- Users belong to orgs via `Membership` with roles; optional site-scoped memberships

### 4.4 Dual-ledger inventory (platform IP)

Two logical ledgers over the same transaction stream:

| Ledger  | What it holds                                                  |
| ------- | -------------------------------------------------------------- |
| **RAW** | Component stock at bins (qty, optional lot, optional serial)   |
| **KIT** | Sealed kit instances (and optionally staged-in-progress holds) |

**Transaction types (immutable inventory events):**

- `RECEIPT` — inbound to RAW
- `ADJUST` — cycle count / correction
- `RESERVE` — soft hold for a kit demand (does not move location)
- `PICK` — RAW qty leaves source bin (still “in transit / picker”)
- `STAGE` — material lands in staging cell against a kit; lot/serial captured
- `SEAL` — kit instance created on KIT ledger; RAW staging holds closed
- `RELEASE` — kit issued to assembly or ship
- `UNSEAL` / `RETURN` — controlled reverse (supervisor + DNA rules)
- `TRANSFER` — bin-to-bin RAW move

**Rules:**

- No negative available qty (on-hand − reserved − staged holds)
- Serial-controlled parts: qty movements are 1:1 with serial records
- Lot-controlled parts: every STAGE/SEAL line requires lot
- Kit Seal cannot complete unless DNA validation strategy returns pass

### 4.5 Kit Seal (platform IP)

On validation success the system computes:

```
sealFingerprint = H(
  organizationId,
  kitId,
  dnaVersionId,
  sorted(lines: partId, qty, lot?, serial?, stagingCellId),
  demandType,
  sealedAt
)
```

- Algorithm: SHA-256 (hex), stored on `Kit.sealFingerprint`
- Printed on kit sheet as barcode/QR of kit instance code + short seal suffix
- Re-open / unseal invalidates seal and records reason (audit)
- Patent narrative: _multi-factor completeness fingerprint binding BOM identity, identity-tracked material, physical staging cell, and tenant method version into a single seal artifact_

### 4.6 Customer Method DNA (per-customer IP)

**Method DNA** is a versioned configuration + strategy binding unique to each organization (optional site overrides).

**Strategy slots (v1):**

| Slot          | Purpose                      | Default strategy (platform IP)                         |
| ------------- | ---------------------------- | ------------------------------------------------------ |
| `allocation`  | How stock is chosen          | FEFO lots, then nearest bin, serial FIFO               |
| `pickPath`    | Pick list ordering           | Zone snake / bin sort                                  |
| `staging`     | Where staged material lives  | Dedicated kit staging cell assignment                  |
| `scanGrammar` | Legal scan sequences         | Kit → Location → Part [→ Lot] [→ Serial] → confirm     |
| `validation`  | Completeness rules           | Exact BOM qty + required lot/serial + cell occupancy   |
| `seal`        | When seal is allowed         | All lines staged & validated, no open exceptions       |
| `document`    | Pick list / kit sheet layout | Standard manufacturing + fulfillment templates         |
| `exception`   | Shortages / wrong-part       | Block seal; allow supervisor substitute if DNA permits |

**DNA lifecycle:**

1. Org created → clone **Platform Default DNA v1** into org `MethodDna` draft
2. Admin edits strategies/config → new draft version
3. **Publish** → immutable `MethodDnaVersion` (semver or monotonic)
4. New kits bind to **current published** DNA version at creation
5. In-flight kits keep their bound version (no mid-kit DNA mutation)
6. **Export DNA pack** (JSON) for customer IP documentation / backup
7. Site may override a subset of slots if org policy allows

**Isolation:**

- DNA rows scoped by `organizationId`
- Export requires org admin role
- Strategy implementations live in code registry keyed by `strategyId` (not customer-uploaded code in v1)
- Customer uniqueness = combination of selected strategies + config parameters + document templates + exception policies

---

## 5. Domain Model

### 5.1 Core entities

```
Organization
  id, name, slug, createdAt

User
  id, email, name, passwordHash | externalId

Membership
  userId, organizationId, role (OWNER|ADMIN|PLANNER|OPERATOR|SUPERVISOR|VIEWER)

Site
  id, organizationId, code, name, timezone

Zone
  id, siteId, code, name, type (STORAGE|STAGING|SHIP|ASSEMBLY)

Location (bin / staging cell)
  id, zoneId, code, barcode, type (BIN|STAGING_CELL|CART|TOTE)
  attributes JSON (aisle, bay, level, capacityHints)

Part
  id, organizationId, sku, name, uom
  tracking (NONE|LOT|SERIAL|LOT_AND_SERIAL)
  isActive

Bom / KitDefinition
  id, organizationId, code, name, revision
  lines: [{ partId, qty, isOptional?, substituteGroup? }]

Demand (unified origin)
  id, organizationId, siteId
  type (ASSEMBLY_JOB | FULFILLMENT_ORDER)
  externalRef, dueAt, priority
  status

Kit (runtime instance)
  id, organizationId, siteId
  kitDefinitionId, demandId?
  dnaVersionId
  status
  stagingLocationId?
  sealFingerprint?, sealedAt?, sealedById?
  kitInstanceCode (human/scannable)

KitLine
  id, kitId, partId, requiredQty
  stagedQty, status (OPEN|PARTIAL|COMPLETE|EXCEPTION)

InventoryBalance (materialized)
  organizationId, siteId, locationId, partId, lotId?, serialId?
  onHand, reserved, staged

Lot
  id, organizationId, partId, lotNumber, expiresAt?

Serial
  id, organizationId, partId, serialNumber, lotId?, status (AVAILABLE|RESERVED|STAGED|CONSUMED)

InventoryTransaction
  id, organizationId, siteId, type, partId, qty
  fromLocationId?, toLocationId?
  lotId?, serialId?, kitId?, kitLineId?
  actorId, createdAt, meta JSON

MethodDna
  id, organizationId, name, isDefault

MethodDnaVersion
  id, methodDnaId, version, publishedAt, config JSON, strategyBindings JSON
  contentHash

ScanSession
  id, kitId, operatorId, state, startedAt, lastEventAt

Document
  id, organizationId, kitId, type (PICK_LIST|KIT_SHEET), storageKey, createdAt

AuditEvent
  id, organizationId, actorId, action, entityType, entityId, payload, createdAt
```

### 5.2 Kit status machine

```
PENDING → ALLOCATED → PICKING → STAGED → VALIDATING → SEALED → RELEASED
                ↘           ↘         ↘            ↘
                 CANCELLED (with rules)              EXCEPTION (side state; may return to PICKING/STAGED)
```

Transitions enforce DNA `scanGrammar` + `validation` + `seal` strategies. Illegal transitions return domain errors (never silent).

### 5.3 Demand types

| Type                | Origin fields                              | Release meaning                 |
| ------------------- | ------------------------------------------ | ------------------------------- |
| `ASSEMBLY_JOB`      | work order / job ref, optional workstation | Kit released to assembly / line |
| `FULFILLMENT_ORDER` | order ref, ship-to, carrier hints          | Kit released to pack/ship       |

Both create the same `Kit` + `KitLine` structure from a `KitDefinition` (BOM).

---

## 6. Primary Workflows

### 6.1 Create kit demand

1. Planner selects site, demand type, kit definition, qty of kit instances (usually 1 per kit row), due date
2. System creates `Demand` + `Kit`(s), binds current published DNA version
3. Allocation strategy reserves stock (`RESERVE` transactions)
4. Status → `ALLOCATED` (or `PENDING` if short; DNA `exception` decides allow/block)

### 6.2 Generate pick list

1. Pick-path strategy orders lines by location
2. Document strategy renders pick list PDF + on-screen list
3. Kit status → `PICKING` when first pick starts

### 6.3 Pick & stage (scan grammar)

Default grammar (overridable via DNA):

1. Scan **kit** (or open kit session)
2. Scan **staging cell** (assign if unbound)
3. Scan **part** (or bin then part — DNA config)
4. If lot-controlled → scan/enter **lot**
5. If serial-controlled → scan **serial**
6. Confirm qty (default 1 for serial)
7. Emit `PICK` + `STAGE` (or combined `STAGE` from reserved bin)
8. Update kit line staged qty; push SSE status

**Wrong-part / wrong-lot / wrong-serial / wrong-cell:** DNA exception strategy → block, warn, or supervisor override path. All outcomes audited.

### 6.4 Validate & seal

1. Status → `VALIDATING`
2. Validation strategy checks every line vs BOM, tracking requirements, staging cell occupancy
3. Seal strategy builds fingerprint; status → `SEALED`
4. KIT ledger receives kit instance; RAW staged holds closed
5. Kit sheet generated with seal barcode

### 6.5 Release

- Assembly: mark released to job; optional consume-to-WIP flag (v1: status + audit)
- Fulfillment: mark released to ship; optional packing note on kit sheet

### 6.6 Real-time board

Site dashboard SSE stream:

- Counts by status
- Kits blocked on exception
- Operator active scan sessions
- Seal rate / shortages (simple metrics)

---

## 7. API Surface (foundation)

REST-ish JSON under `/api/v1` with session auth + org context header or path.

| Area         | Examples                                                  |
| ------------ | --------------------------------------------------------- |
| Orgs/Sites   | `POST /orgs`, `POST /sites`, memberships                  |
| Catalog      | CRUD parts, locations, kit definitions                    |
| DNA          | get current, draft update, publish, export, list versions |
| Demands/Kits | create demand, list kits, get kit detail, cancel          |
| Inventory    | balances, receipts, adjusts, transfers                    |
| Scan         | `POST /scan/events` (idempotent with clientEventId)       |
| Seal         | `POST /kits/:id/validate`, `POST /kits/:id/seal`          |
| Documents    | `POST /kits/:id/pick-list`, `GET /documents/:id`          |
| Realtime     | `GET /sites/:id/events` (SSE)                             |

**Scan event payload (canonical):**

```json
{
  "clientEventId": "uuid",
  "kitId": "...",
  "sessionId": "...",
  "type": "SCAN_PART",
  "payload": { "barcode": "SKU-123", "qty": 1 },
  "scannedAt": "ISO-8601"
}
```

Server maps barcode → entity, advances scan state machine, returns next expected prompt + kit snapshot.

Idempotency: unique `(organizationId, clientEventId)`.

---

## 8. UI Surfaces

| Route        | Users               | Purpose                                              |
| ------------ | ------------------- | ---------------------------------------------------- |
| `/`          | all                 | Org/site switcher, status board                      |
| `/kits`      | planner, supervisor | Kit queue, filters, create demand                    |
| `/kits/[id]` | all roles (scoped)  | Detail, lines, timeline, seal, docs                  |
| `/scan`      | operator            | Large-target scan console; works with wedge + camera |
| `/inventory` | planner, admin      | Balances, receipts, transfers                        |
| `/catalog`   | admin, planner      | Parts, BOMs, locations                               |
| `/dna`       | admin               | Method DNA editor, publish, export                   |
| `/admin`     | owner/admin         | Users, sites, roles                                  |

**Scan UX principles:**

- Full-screen, high contrast, large “next expected scan” prompt
- Hardware keyboard wedge lands in always-focused capture input
- Optional device camera barcode (browser BarcodeDetector / library fallback)
- Offline: not required in v1; show clear connectivity loss banner

---

## 9. Error Handling

| Class                                        | Behavior                                      |
| -------------------------------------------- | --------------------------------------------- |
| Domain rule (wrong status, insufficient qty) | 409 + machine-readable `code` + human message |
| Validation (Zod)                             | 400 + field errors                            |
| Auth / tenant                                | 401 / 403; never leak existence across orgs   |
| Idempotent replay                            | 200 with original result                      |
| Concurrency (double seal)                    | transactional row lock on kit; loser gets 409 |
| DNA missing strategy                         | fail closed at kit create / seal              |

All mutations write `AuditEvent` where material, DNA, or seal state changes.

---

## 10. Security

- Password hashing (argon2/bcrypt) or OAuth later; sessions HTTP-only secure cookies
- Org context required on every business query
- RLS policies aligned with `organization_id`
- Role checks on DNA publish/export, unseal, inventory adjust
- Rate limit scan endpoints per operator session
- No secrets in DNA export packs

---

## 11. Testing Strategy

| Layer       | What                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| Unit        | Dual-ledger math, seal fingerprint stability, scan grammar transitions, each strategy |
| Integration | Prisma + Postgres: allocate → stage → seal → release; multi-tenant isolation          |
| API         | Authz matrix; idempotent scan; DNA version immutability after publish                 |
| E2E (smoke) | Create BOM → demand → pick list → scan stage → seal → kit sheet                       |

**Golden tests for IP:** fixed inputs produce stable seal fingerprints and DNA content hashes (document for patent support and customer export integrity).

---

## 12. Seed & Demo Data

Onboarding seed for a demo org (“Apex Assembly Co.”):

- 1 org, 2 sites
- Zones + bins + staging cells with barcodes
- 20 parts (mix of NONE / LOT / SERIAL)
- 3 kit definitions (assembly + fulfillment)
- Sample stock with lots/serials
- Published default Method DNA
- 5 kits in various statuses for the board

---

## 13. Patent / IP Narrative (for product & legal packaging)

**Not legal advice** — product design intent for differentiation:

1. **Dual-ledger kitting with seal-bound transfer** — atomic transition of identity-tracked components from RAW staging holds into a sealed KIT instance under a versioned method profile.
2. **Scan-order grammar enforcement** — finite-state validation of scan sequences as a condition of inventory stage and seal, parameterized per tenant DNA.
3. **Method DNA binding** — kit instances permanently bound to immutable method versions; seal fingerprint includes DNA version identity.
4. **Multi-factor kit completeness fingerprint** — hash over BOM satisfaction, lot/serial identity, staging cell, and method version.
5. **Per-customer method isolation and exportable DNA packs** — tenant-specific strategy bindings and configs as portable IP artifacts.

Implementation should keep strategy modules and seal/ledger code clearly modular for claims mapping.

---

## 14. Implementation Phases

### Phase 0 — Skeleton

- Next.js app, Prisma schema, auth, org/site membership, RLS stubs, CI script

### Phase 1 — Catalog & inventory

- Parts, locations, lots, serials, balances, receipt/adjust/transfer
- Dual-ledger transaction engine

### Phase 2 — Kits & DNA

- Kit definitions, demands, kit lifecycle
- Method DNA model, default strategies, publish/export
- Allocation + reserve

### Phase 3 — Scan & seal

- Scan sessions, grammar state machine, stage transactions
- Validate + Kit Seal + kit sheet / pick list PDFs
- SSE status board

### Phase 4 — Hardening

- Role matrix, audit polish, multi-tenant tests, seed demo, operator UX pass

Each phase is independently demoable; Phase 3 is the first “full loop” for shop-floor narrative.

---

## 15. Success Criteria

Foundation is successful when:

1. Two orgs on one DB cannot read each other’s kits, stock, or DNA
2. A kit can be allocated, picked/staged via scans (lot + serial paths), sealed with stable fingerprint, and released for both demand types
3. Pick list and kit sheet generate and reference the seal
4. Real-time board reflects status changes without refresh
5. Org admin can publish a new DNA version; in-flight kits remain on old version
6. Unit + integration tests cover ledger invariants and seal stability
7. Demo seed walks a new user through the full loop in under 15 minutes

---

## 16. Open Decisions (resolved for v1)

| Topic                | Decision                                      |
| -------------------- | --------------------------------------------- |
| Deliverable          | Full-stack production foundation              |
| Ops model            | Unified assembly + fulfillment                |
| Tenancy              | Multi-tenant + multi-site                     |
| Stack                | Next.js + Postgres + Prisma                   |
| Tracking             | Full lot + serial support                     |
| Architecture         | Dual-ledger + Kit Seal + Customer Method DNA  |
| Real-time            | SSE                                           |
| Customer code upload | Not in v1 (registry strategies + config only) |

---

## 17. Next Step

Invoke **writing-plans** to produce a detailed implementation plan from this spec (task DAG, file-level work, test checkpoints), then implement phase by phase.
