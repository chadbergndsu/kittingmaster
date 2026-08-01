# KittingMaster

Production foundation for **staging and kitting components** in manufacturing, assembly, and fulfillment.

Built around three proprietary pillars:

1. **Dual-ledger inventory** — RAW component stock vs sealed KIT instances, with typed transactions (`RECEIPT`, `RESERVE`, `PICK`, `STAGE`, `SEAL`, `RELEASE`).
2. **Kit Seal** — multi-factor completeness fingerprint binding BOM lines, lot/serial identity, staging cell, and Method DNA version.
3. **Customer Method DNA** — per-tenant, versioned strategy packs (allocation, pick path, staging, scan grammar, validation, seal, documents, exceptions). Exportable as customer IP packs.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma 6 + SQLite (zero-config demo; swap to Postgres for production)
- Session auth (JWT cookie via `jose`)
- Vitest for seal + scan grammar unit tests

## Quick start

```bash
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Demo login**

- Email: `demo@kittingmaster.app`
- Password: `demo1234`

## Core workflows

| Flow | Path |
|------|------|
| Live status board | `/dashboard` |
| Create kits (assembly or fulfillment) | `/kits` |
| Scan staging / parts / lots / serials | `/scan` |
| RAW + KIT ledger view | `/inventory` |
| Parts, BOMs, locations | `/catalog` |
| Method DNA + export pack | `/dna` |

### Shop-floor scan grammar (default DNA)

1. Scan **staging cell** barcode (e.g. `STG-CELL-01`)
2. Scan **part** SKU/barcode
3. If lot-controlled → scan **lot**
4. If serial-controlled → scan **serial**
5. When all lines staged → **Validate & seal** on kit detail
6. **Release** to assembly or ship

## API (authenticated)

- `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET/POST /api/kits` · `GET /api/kits/:id`
- `POST /api/kits/:id/pick-list` · `POST /api/kits/:id/seal` · `POST /api/kits/:id/release`
- `POST /api/scan` (idempotent via `clientEventId`)
- `GET /api/inventory` · `GET /api/catalog` · `GET /api/status`
- `GET/POST /api/dna` (list / export pack)

## Multi-tenant model

`Organization` → `Site` → zones/locations. All business rows carry `organizationId`. Demo seed creates **Apex Assembly Co.** with Plant 1 + Fulfillment DC sites.

## Custom IP (Method DNA)

Each customer gets a default DNA profile cloned from platform strategies. Published versions are immutable and bound to kits at creation time. Admins can **Export DNA pack** (JSON) for documentation / backup of customer-specific method configuration.

## Tests

```bash
npm test
```

## Design spec

See [`docs/superpowers/specs/2026-08-01-kittingmaster-design.md`](docs/superpowers/specs/2026-08-01-kittingmaster-design.md).

## Production notes

- Set a strong `SESSION_SECRET`
- Change `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`
- Run migrations against managed Postgres
- Add RLS policies and OAuth as needed for SaaS hardening

## License

Proprietary — all rights reserved for product and customer Method DNA IP concepts.
