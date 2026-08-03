# KittingMaster

Production foundation for **staging and kitting components** in manufacturing, assembly, and fulfillment.

Follows **[Solid Systems Standards](https://github.com/chadbergndsu/solid-systems-standards)** — simplicity, portable stack, automated quality, no secrets in git, observability, documented non-obvious design.

## Purpose

Help companies:

- Create kits (assembly jobs + fulfillment orders)
- Stage components at locations with barcode scan workflows
- Track dual inventory (RAW components vs sealed kits)
- Generate pick lists / kit sheets
- Seal kits with multi-factor completeness fingerprints
- Run per-customer Method DNA (versioned process IP)

## Stack

| Layer  | Choice                                          | Notes                                     |
| ------ | ----------------------------------------------- | ----------------------------------------- |
| App    | Next.js 16 (App Router) + TypeScript + Tailwind | Portable web frontend                     |
| API    | Next.js Route Handlers                          | Same deployable unit                      |
| DB     | PostgreSQL + Prisma 6                           | Own your data; swap hosts freely          |
| Auth   | JWT HTTP-only cookies (`jose`)                  | No auth SaaS required                     |
| Tests  | Vitest                                          | Core domain pure functions                |
| CI     | GitHub Actions                                  | Lint, format, typecheck, test, build      |
| Deploy | Vercel                                          | Solid Systems default for light fullstack |

## Live

- **Production:** https://kittingmaster.vercel.app (HTTPS via Vercel)
- **Health:** https://kittingmaster.vercel.app/api/health
- **Demo:** `demo@kittingmaster.app` / `demo1234`

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL + SESSION_SECRET
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Required env vars

See [`.env.example`](.env.example). **Never commit real secrets.**

| Variable         | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string                          |
| `SESSION_SECRET` | JWT signing secret (long random in prod)              |
| `SEED_SECRET`    | Optional admin seed gate                              |
| `SENTRY_DSN`     | Optional error tracking (SDK not required by default) |

## Architecture

High level:

```
Browser → Next.js (UI + API) → Prisma → PostgreSQL
                ↓
         SSE / webhooks / CSV export
```

Non-obvious domain design (dual ledger, DNA binding, scan FSM):  
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

Product design spec:  
[`docs/superpowers/specs/2026-08-01-kittingmaster-design.md`](docs/superpowers/specs/2026-08-01-kittingmaster-design.md)

Market positioning:  
[`docs/MARKET_POSITIONING.md`](docs/MARKET_POSITIONING.md)

## Key product surfaces

| Path          | Role                               |
| ------------- | ---------------------------------- |
| `/dashboard`  | Live kit board (SSE + ops KPIs)    |
| `/kits`       | Create / filter kit demands        |
| `/waves`      | Batch wave picking                 |
| `/scan`       | Operator scan console              |
| `/exceptions` | Shortages, FEFO risk, exceptions   |
| `/inventory`  | RAW ledger, receipts, cycle counts |
| `/catalog`    | Parts + BOM definitions            |
| `/dna`        | Method DNA publish/export          |
| `/settings`   | Webhooks + integration exports     |

## Quality automation

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest (domain logic)
npm run build          # Prisma generate + Next build
npm run ci             # all of the above
```

CI runs on every push/PR to `main` via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Deploy

**Default:** Vercel from Git (`main` → production).

1. Connect the GitHub repo to Vercel
2. Set env vars in the Vercel project (not in git):
   - `DATABASE_URL`
   - `SESSION_SECRET`
3. Run migrations against prod DB once: `npm run db:deploy` (with prod `DATABASE_URL`)
4. Optional seed: `npm run db:seed`

Health check for monitors: `GET /api/health`

- `200` = app + database OK
- `503` = database degraded

## Observability

- Structured JSON logs via `src/lib/observability.ts`
- Unexpected API errors go through `captureError` (no silent 500s)
- `/api/health` for uptime checks
- Optional Sentry: set `SENTRY_DSN` and install `@sentry/nextjs` when you want hosted error tracking (intentionally not a hard dependency)

## Secrets policy

- Secrets only in `.env` (local), Vercel env, or GitHub Secrets
- `.env` / `.env.local` are gitignored
- `.env.example` documents keys without values

## License

Proprietary — product and customer Method DNA IP concepts reserved.
