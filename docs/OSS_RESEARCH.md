# Unconventional Open Source for KittingMaster

**Date:** 2026-08-03  
**Lens:** Solid Systems (own the stack, portable, no lock-in) + product IP (dual-ledger, Kit Seal, Method DNA)  
**Goal:** Find OSS others skip when building “another WMS,” and decide **steal ideas / integrate / ignore**.

Most teams default to: Odoo, ERPNext, custom Postgres rows, Stripe-for-everything thinking. Below is the path less taken.

---

## Executive take

The biggest overlooked pattern is **treating inventory like money**:

| Inventory concept | Financial analogue | Why it matters |
|-------------------|--------------------|----------------|
| RAW on-hand | Cash balance | Scarcity is real |
| Reserve | Hold / authorization | Prevents double-spend of stock |
| Stage | In-transit escrow | Cell occupancy = custody |
| Seal → KIT ledger | Settlement | Completeness is irreversible (or audited reverse) |
| Cycle count | Reconciliation | Drift must surface |

KittingMaster already speaks this language. Almost no competitor pairs that with **Method DNA + Kit Seal**. The OSS below amplifies that story—or becomes a weaponized backend.

---

## Tier A — High leverage, rarely considered for kitting

### 1. Formance Ledger ([formancehq/ledger](https://github.com/formancehq/ledger))

**What it is:** Programmable **double-entry** ledger (Numscript DSL). Atomic multi-postings; balances derived from immutable log. Built for fintech, not warehouses.

**Why nobody applies it to kitting:** Marketing says “money.” The model is domain-agnostic: accounts + transfers + invariants.

**How KM could use it (research spike, not mandatory rewrite):**

```
Accounts (per org/site):
  RAW:{sku}:{location}
  HOLD:{kitId}
  STAGED:{kitId}:{cell}
  KIT:{kitInstance}

Numscript-style move:
  send [SKU 8] (
    source = @RAW:FST-M6:A-01-02
    destination = @STAGED:KIT-123:CELL-01
  )
```

- Dual-ledger becomes **enforced by construction** (debits = credits).
- Seal = multi-leg settlement into `@KIT:…`.
- Audit trail is free and accountant-grade.

**Solid Systems fit:** Self-hostable, Apache-ish ownership story; keep Prisma as operational projection if Formance is system-of-record for stock truth.

**Risk:** Ops team must learn ledger mental model; latency/hosting vs Postgres.

**Verdict:** **Steal the model heavily; integrate only if we need financial-grade concurrency proof.** Prototype: map existing `InventoryTransaction` types to Formance postings for one demo org.

---

### 2. TigerBeetle ([tigerbeetle.com](https://tigerbeetle.com/))

**What it is:** Purpose-built **debit/credit database** (not a general SQL DB). Extreme throughput, strict serializability, double-entry as native schema.

**Why overlooked for WMS:** Marketed to fintech/payments.

**Kitting angle:** High-frequency scan events (100+ operators) where Postgres row locks on balances become the bottleneck. TigerBeetle as **balance engine**; Postgres remains catalog/BOM/DNA/UI.

**Verdict:** **Ignore for v1–v2 customers.** **Watch** for multi-plant scan storms. Architecture doc should leave a “ledger backend interface” so Postgres isn’t forever.

---

### 3. Google OR-Tools ([github.com/google/or-tools](https://github.com/google/or-tools))

**What it is:** OSS combinatorial optimization (CP-SAT, routing, bin packing, assignment).

**Why overlooked:** Teams hardcode “sort by aisle.” Competitors sell “AI waves” as black-box SaaS.

**Kitting applications (differentiating, patent-adjacent):**

| Problem | OR-Tools tool | Output |
|---------|---------------|--------|
| Wave membership (which kits share bins) | CP-SAT clustering / assignment | Wave packs minimizing unique locations |
| Pick path within wave | Vehicle Routing (TSP variant) | Ordered pick list by travel |
| Kit packing into cells/totes | Bin packing | Cell assignment under capacity |
| FEFO + shortage fairness | Constraint programming | Allocation under expiry + priority |

**Solid Systems fit:** Pure library, no SaaS. Run as:

- Node binding (limited) **or**
- Small Python sidecar / serverless worker fed kit + location graph JSON
- Cache solutions; never block scan path on solver failure

**Verdict:** **Integrate next** as optional `Method DNA` strategy slots: `allocation=ortools_fefo`, `pickPath=ortools_tsp`. Default stays heuristic.

---

### 4. OpenBoxes ([openboxes.com](https://openboxes.com/))

**What it is:** Self-hosted inventory for healthcare supply chains—lots, expiry, multi-location, controlled workflows.

**Why relevant:** Not “manufacturing WMS,” but **lot/expiry discipline** is industry gold. FEFO, recalls, cold-chain patterns.

**Verdict:** **Do not adopt as platform.** **Steal UX and workflow language** for FEFO board, recall-by-lot, and quarantine status. Aligns with shortage/exception work already shipped.

---

### 5. ledger-cli ([ledger-cli.org](https://ledger-cli.org/))

**What it is:** Plain-text double-entry accounting CLI (decades old, BSD).

**Why insane (in a good way) for Method DNA IP:**

Export a sealed kit period as a **portable text ledger**:

```
2026-08-01 * Seal SHIP-STARTER-026213
    KIT:SHIP-STARTER-026213      1 KIT
    STAGED:CELL-02:BRK-100      -2 EA
    STAGED:CELL-02:FST-M6        -4 EA
    …
```

Customer gets **exportable IP evidence** of how stock moved under their DNA version—without vendor lock-in PDFs only.

**Verdict:** **Integrate as export format** alongside DNA JSON pack. Tiny win, huge ownership story (Solid Systems).

---

## Tier B — Strong ideas, careful boundaries

### 6. OpenWMS.org ([openwms.github.io](https://openwms.github.io/org.openwms/))

Modular WMS + WCS building blocks for integrators (Java).  
**Verdict:** Too heavy to embed. **Steal domain vocabulary** (transport unit, location group, ASRS hooks) for future hardware partners.

### 7. ModernWMS ([fjykTec/ModernWMS](https://github.com/fjykTec/ModernWMS))

Complete small WMS from ERP implementers.  
**Verdict:** **Competitor research**, not dependency. Compare screens for receiving/putaway completeness.

### 8. Apache OFBiz

Full ERP/MRP/manufacturing.  
**Verdict:** **Never adopt the monolith** (complexity violates Solid Systems #1). **Steal:** BOM/routing/MRP entity shapes for future “import work order” adapters.

### 9. myWMS

Classic OSS WMS.  
**Verdict:** Legacy reference only.

---

## Tier C — Adjacent OSS that unlocks “impossible” features

| Project | Uncommon use for KM |
|---------|---------------------|
| **ZXing / zxing-js / html5-qrcode** | Camera scan on rugged phones without Scandit licenses |
| **n8n** (self-host) | Visual ERP glue for shops that won’t write webhooks |
| **Temporal / Windmill** | Long-running wave orchestration with retries (not needed until multi-step automation) |
| **Apache Superset / Metabase** | Plant manager BI on read-replica; stop rebuilding charts in React |
| **EventCatalog** | Document seal/scan/wave event contracts for integrators |
| **ElectricSQL / PowerSync / CRDTs** | Offline scan queue for dead Wi‑Fi corners of the plant |
| **PostHog (self-host)** | Funnel: allocate → first scan → seal (product analytics, not vanity) |
| **minizinc / OR-Tools** | Same optimization family; OR-Tools preferred for routing examples |

---

## What competitors are *not* doing (positioning)

1. **Inventory as double-entry** with customer-exportable ledgers (Formance mental model + ledger-cli export).
2. **Optimization as open Method DNA**, not “AI black box” (OR-Tools strategies versioned per tenant).
3. **Healthcare-grade FEFO** without being a pharma product (OpenBoxes patterns).
4. **Offline-first scan** for real plants (local-first sync engines).
5. **BI separation** — ops system stays thin; Metabase/Superset own dashboards (Solid Systems simplicity).

---

## Recommended experiments (priority)

### P0 — This week (low risk)

1. **ledger-cli style export** for sealed kits / period (text dual-entry).
2. **Document event contracts** (scan, seal, wave.released) for integrators.
3. **html5-qrcode** camera path on `/scan` (optional toggle).

### P1 — Differentiating

4. **OR-Tools worker**: input locations + kit lines → ordered pick path; DNA strategy flag.
5. **Ledger interface** abstraction: `InventoryLedger` with Postgres impl today; Formance/TigerBeetle later.

### P2 — Only if customers demand

6. Offline sync (Electric/PowerSync).
7. Metabase embed on ops metrics views.
8. n8n recipe pack for “kit.sealed → NetSuite/QBO.”

---

## Explicit non-goals (Simplicity first)

- Do **not** replace KittingMaster with OpenBoxes/Odoo/OFBiz.
- Do **not** add Kafka “because event sourcing.”
- Do **not** put OR-Tools on the critical scan path without timeout + heuristic fallback.
- Do **not** take TigerBeetle until measured Postgres pain exists.

---

## Sources (non-exhaustive)

- OpenBoxes, OpenWMS.org, ModernWMS, myWMS, Odoo/ERPNext lists (industry defaults)
- Formance Ledger / Numscript docs; TigerBeetle debit-credit model
- Google OR-Tools (routing, packing, CP-SAT)
- Salesforce / Walmart eng posts on event-sourced inventory availability
- ledger-cli plain-text accounting
- Apache OFBiz manufacturing module (concept mining only)

---

## Bottom line

The “obvious” OSS for kitting is Odoo. The **non-obvious** stack is:

> **Own the workflow IP (DNA + Seal + scan grammar) in KM**  
> **Borrow financial ledger invariants** (Formance thinking / ledger-cli export)  
> **Borrow OR-Tools for waves and paths** as optional strategies  
> **Borrow OpenBoxes discipline for lots/expiry**  
> **Keep Postgres until proven otherwise**

That combination is rare. Ship it carefully under Solid Systems rules.
