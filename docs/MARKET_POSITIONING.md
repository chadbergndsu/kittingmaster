# KittingMaster — Market Positioning & Build Rationale

_Last updated: 2026-08-02_

## Market context

Industry sources (WMS / warehouse kitting guides from Modula, Logimax, Buske, Finale, SG Systems) consistently describe kitting as:

1. **BOM-driven grouping** of components for assembly or fulfillment
2. **Pick → stage/validate → release** with barcode confirmation
3. **Dual inventory views**: raw components vs finished kits
4. **Shortages** as the primary delay/failure mode
5. **Wave/batch picking** to cut travel time when many kits share parts
6. **Lot/serial/expiry (FEFO)** for regulated and perishable components
7. **ERP/MRP integration** for demand in and completion out

## Competitive gaps we target

| Market need | Typical WMS | KittingMaster |
|-------------|-------------|---------------|
| Generic pick lists | Strong | Strong + scan grammar FSM |
| Kit completeness seal | Weak / checklist only | **Kit Seal fingerprint** (BOM + lot/serial + cell + DNA version) |
| Per-customer methods | Rare (one-size config) | **Method DNA** versioned IP packs |
| Dual ledger honesty | Partial | **RAW vs KIT** typed transactions |
| Shortages board | Often buried | First-class **exceptions + shortages** UI |
| Wave batching | Enterprise SKU | **Wave pick** with aggregate + per-kit docs |
| Outbound events | Connector marketplace | **Webhooks** on seal/exception + CSV export |
| Cycle count safety | Standard | Adjust blocked when &lt; reserved+staged |

## Senior engineering standards applied

- Domain pure functions (`shortages`, `metrics`, `scan grammar`, `seal`) unit-tested
- Inventory mutations transactional; seal never blocked by webhook failure
- Idempotent scan events (`clientEventId`)
- Role gates on DNA publish, cycle count, webhook config
- Multi-tenant `organizationId` on every business row
- Immutable DNA versions bound at kit create (no mid-flight method drift)

## Build priorities (rolling)

1. ~~Shortages + exceptions~~
2. ~~Wave picking~~
3. ~~Ops KPIs + live board~~
4. ~~Cycle count / adjust~~
5. ~~Webhook + CSV integration~~
6. Permanent managed Postgres (Neon) — infra
7. Source-bin verification scan step (location → part)
8. Labor metrics by operator
9. Import work orders CSV

## Sources informing this roadmap

- Modula: warehouse kitting process, assembly vs fulfillment kits (2025)
- Finale Inventory: wave vs batch picking, barcode validation prompts (2025)
- Logimax / 3PL kitting: shortage and completeness challenges
- Buske: dual inventory (components + finished kits) and WMS coordination (2026)
- SG Systems: lot/qty barcode validation and exception handling on kit waves
