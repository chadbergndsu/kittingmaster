# Architecture (non-obvious)

## Why dual ledger

Shop-floor kitting fails when stock “disappears” between bin and kit tote. KittingMaster models two ledgers over one transaction stream:

- **RAW** — component on-hand / reserved / staged at locations
- **KIT** — sealed kit instances (logical inventory of completed kits)

`SEAL` closes RAW staged holds and records the kit as complete. This is intentional product IP, not a generic WMS move.

## Why Method DNA is versioned and immutable

Customers run different pick grammars and validation rules. Publishing a DNA version freezes strategy bindings + config. Kits bind DNA **at create time** so in-flight kits never change mid-process when methods are updated.

## Why scan grammar is a state machine

Market WMS practice requires ordered validation (cell → part → lot → serial). The grammar lives in pure code (`src/lib/scan/grammar.ts`) so it is unit-tested and DNA-parameterizable without shipping customer code.

## Multi-tenancy

Every business table includes `organizationId`. Session JWT carries org + role. Always scope queries by org; never trust client-supplied org ids for authorization.

## Webhooks

Outbound webhooks (`kit.sealed`, `kit.exception`) are fire-and-forget with a short timeout. They must not block seal or staging. Failures are logged; shop floor wins.

## Database

PostgreSQL via Prisma. Same schema local and prod. Migrations live in `prisma/migrations`. Prefer managed Postgres you own (Neon, RDS, Prisma Postgres) over ephemeral demo DBs for production.

## Deploy

- **Platform:** Vercel (Solid Systems default for light fullstack)
- **CI:** GitHub Actions (`.github/workflows/ci.yml`)
- **Secrets:** Vercel env + GitHub Secrets only — never git
- **Health:** `GET /api/health` (process + DB)

## Optional Sentry

Set `SENTRY_DSN` when you want hosted error tracking. The app logs structured JSON errors by default without a Sentry dependency (portable stack).
