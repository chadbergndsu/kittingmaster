# AGENTS.md — Solid Systems Standards

You must follow the Solid Systems Standards on every task in this repository (and in every project when this file is loaded as global rules).

**Source of truth:** https://github.com/chadbergndsu/solid-systems-standards (v1.5 — 2026-08-04)

This file embeds the full standards so agents enforce them without needing network access.

---

## Goal

Reliable, maintainable, secure systems that scale with the business and don't create constant firefighting.

---

## Core Rules (non-negotiable)

1. **Simplicity first** — Build only what is needed. Complexity is the enemy. Do not add complexity that is not required.
2. **Own the code and data** — Prefer portable stacks. Minimize lock-in. You (or the client) own the repo and the IP.
3. **Automate quality** — Linting, tests, and CI are mandatory gates, not optional.
4. **Never commit secrets** — Ever.
5. **Observability is required** — If you can't see it failing, it will fail silently. Fix silent failures.
6. **Document the non-obvious** — Future you will thank present you.
7. **Security is not optional** — Auth fail-closed in production. RBAC on sensitive operations. No security theater.

---

## Mandatory Checklist

**Verify before declaring any non-trivial work done.** Report status when finishing substantial work.

- [ ] GitHub repo created (private by default)
- [ ] Main branch protected + required pull request reviews (when collaborating / shipping)
- [ ] Clear README: purpose, tech stack, setup, architecture, deploy steps
- [ ] `.env.example` present (real secrets never committed; production-critical vars documented)
- [ ] Proper `.gitignore`
- [ ] Linter + formatter configured and running in CI
- [ ] Type safety where the language supports it (TypeScript strongly preferred for web)
- [ ] Basic tests for core logic **and critical money/auth paths**
- [ ] GitHub Actions CI that runs on every PR and blocks merge on failure
- [ ] Secrets stored only in platform environment variables / GitHub Secrets
- [ ] Error tracking (Sentry or equivalent) considered / live for production
- [ ] Deployment happens from Git — no manual uploads
- [ ] HTTPS only
- [ ] Basic monitoring / uptime / health check considered
- [ ] Auth fail-closed in production (no open pilot without explicit break-glass)
- [ ] Dependabot (or equivalent) enabled for active products

### Before finishing non-trivial work (agent duty)

1. Run lint, typecheck, and tests when those scripts exist.
2. Do not leave secrets, credentials, or API keys in source or commits.
3. Surface errors to the user or logs — never swallow failures silently.
4. Update README / docs when behavior or setup changes non-obviously.
5. Report which checklist items are done vs still open.
6. For multi-file / security-sensitive / money-path changes: run a **findings-only review** (see Review Standards) before claiming done — fix or explicitly defer with severity.

---

## New Project Checklist

Use when scaffolding or bringing a repo up to production readiness.

### Setup

- [ ] Create private GitHub repository
- [ ] Protect `main` branch (require PR + status checks) when plan allows
- [ ] Add CODEOWNERS if multiple people
- [ ] Standard issue and PR templates (optional but useful)

### Code Quality

- [ ] Linter + formatter (ESLint + Prettier, Biome, oxlint + Prettier, or language equivalent)
- [ ] TypeScript (or strong typing) enabled
- [ ] Unit / integration tests for critical paths (auth, money, workflow, portal tokens)
- [ ] GitHub Actions workflow: lint → typecheck → test on every PR
- [ ] `packageManager` pinned when using npm (e.g. `"npm@10.9.8"`) matching CI; Corepack in CI

### Configuration

- [ ] `.env.example` with all required variables documented (including auth break-glass rules)
- [ ] Real secrets only in Vercel / Railway / GitHub Secrets / etc.
- [ ] No secrets or credentials in git history

### Deployment & Runtime

- [ ] Deploy pipeline connected to GitHub
- [ ] Preview environments for PRs (Vercel does this automatically)
- [ ] Error tracking (Sentry) configured and tested for production
- [ ] Basic uptime / health check (`GET /api/health` or static health JSON)
- [ ] HTTPS enforced
- [ ] Security headers on web apps (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` minimum)

### Documentation

- [ ] README covers: what it does, how to run locally, how to deploy, architecture overview
- [ ] ADRs for major technical decisions (`/docs/adr`)

### Security Baseline

- [ ] Dependabot or equivalent enabled
- [ ] Least privilege for any service accounts / API keys
- [ ] Auth uses a proven library/service (not custom crypto/auth)
- [ ] Production auth **fail-closed** (see Security Standards)
- [ ] Capability checks on mutating / sensitive APIs (not middleware-login alone)
- [ ] Public tokens (portals, magic links) use CSPRNG, not `Math.random()`
- [ ] Idempotency on creates that can double-charge or double-bill

Once all boxes are checked, the system is allowed to go to production.

---

## Security Standards (from production incidents and pilots)

These are mandatory for any app with auth, money, customer PII, or multi-tenant data.

### Auth

1. **Fail closed in production** — Without a configured auth provider, production must not expose mutating APIs. Open pilot / demo mode only via explicit env (e.g. `AUTH_OPEN=1`) and **never** on public production hosts by default.
2. **Documented break-glass** — If `AUTH_OPEN` (or similar) exists, document when it is allowed. Documented behavior must match code.
3. **Middleware is not authorization** — Login gate is coarse. Sensitive routes enforce **capabilities/roles** in the handler (`requireCapability` / equivalent).
4. **No open auto-join** — Signup must not grant org membership by default. Use invite, allowlist, or explicit `AUTH_AUTO_JOIN` for pilots.
5. **First-owner bootstrap** — Prefer env-pinned owner email; guard last-owner demotion.

### APIs & data

1. **RBAC on mutators** — Jobs, tickets, invoices, settings, exports, admin: capability checks. Partial RBAC is a bug.
2. **Money paths** — Status machines for billable work; no create-with-terminal-status bypass; OT/tax/fixed vs T&M rules tested.
3. **Idempotency** — Field/offline creates that can retry must accept an idempotency key.
4. **Payload limits** — Cap base64 images, CSV imports, AI bodies; prefer storage URLs over JSONB blobs at scale.
5. **Tenant isolation** — If `org_id` exists, write and filter it; service role does not replace app-layer scoping.
6. **Safe errors** — Log full errors server-side; clients get stable messages in production (no stack/driver leaks).
7. **Rate limits** — Public forms, PIN unlock, and AI endpoints need throttles.

### Tokens & crypto

1. Portal / magic-link tokens: `crypto.randomBytes` / `randomUUID` — never `Math.random()`.
2. Unlock/HMAC secrets: explicit env in production; no hard-coded defaults.

### Health & recon

1. Public health: minimal `{ ok, status, service, version, timestamp }`.
2. Detailed ops snapshot only via authenticated or `?detail=1` internal use — do not advertise open-pilot/auth mode to the world without need.

---

## Review Standards (agent duty)

Before large merges or after multi-area prototype work:

1. **Parallel subagents** (or `/review` / agentic code-review skill if available) across concerns:
   - Auth / session / middleware
   - Data / money / workflows
   - AI / settings / external APIs
   - Field UI / offline / data loss
2. **Findings only first** when the user asks for review — rank **P0 → P3**:
   - **P0** — correctness, security, data loss, privilege escalation
   - **P1** — money wrong, auth depth, cost abuse, serious races
   - **P2** — missing tests, validation gaps, performance landmines
   - **P3** — recon, UX edge cases, polish
3. Ignore pure style unless it hides a bug.
4. **Do not edit until the user approves** when they asked for findings-only review.
5. After “fix all” / implement: re-run CI; re-verify P0 paths with tests where feasible.

---

## Deployment Defaults

### Why Vercel (default for web frontends and light fullstack)

- Push to GitHub → automatic deploy
- Preview deployment for every pull request
- Global edge network
- Excellent support for Next.js, React, and modern frameworks
- Serverless + edge functions with almost zero config
- Simple environment variable management
- Strong free tier; scales when you grow

**Use Vercel as the default** for websites, dashboards, and most web apps.

### Vercel vs AWS

**Vercel advantages:** near-zero ops, PR previews, optimized for modern web (especially Next.js), global edge, fast iteration.

**AWS advantages:** full control and service catalog (Lambda, ECS/Fargate, RDS, S3, SQS, Step Functions, etc.); better for complex backends, long-running processes, custom networking, multi-region; stronger enterprise/IAM/VPC/compliance; cost efficiency at extreme scale when well-architected; more portable with containers and open standards.

**Decision rule**

- Default to **Vercel** for websites, dashboards, light fullstack, and most client-facing tools.
- Choose **AWS** (or hybrid) only when requirements clearly demand: heavy compute/stateful services, specific AWS services, strict compliance, extreme scale cost optimization, or existing deep AWS investment.
- **Hybrid** is often best: Vercel frontend + AWS (or Railway/Fly) for specialized backends or data layers.
- Do **not** choose AWS just because it sounds more “enterprise.”

### What else?

| Need | Recommendation | Why |
|------|----------------|-----|
| Backend / long-running jobs | Railway, Fly.io, Render | Easy containers, good DX, databases included |
| Pure edge / workers | Cloudflare Workers + Pages | Cheaper at scale, more control, very fast |
| Full ownership / self-host | Docker on Fly.io, Coolify, VPS | No platform lock-in, full control |
| Heavy / enterprise | AWS / GCP / Azure | When requirements clearly demand it |
| Database | Neon or Supabase (Postgres) | Managed, solid, migrations in repo |
| Auth | Clerk, Auth.js, or Supabase Auth | Don't invent authentication |
| Error tracking | Sentry | Industry standard |
| Product analytics | PostHog or Vercel Analytics | Privacy-friendly options exist |

Prefer stacks that make migration possible. Avoid deep platform-specific features unless the value is clear.

---

## AI Coding Tools

### Cursor (default daily driver)

Use Cursor for:

- Everyday interactive coding and editing
- Visual exploration, multi-file changes, and reviewing diffs
- Quick iterations and inline AI assistance
- Medium-sized tasks with Composer / agent mode inside a full IDE

Cursor is the primary editor.

### Grok Build

Use Grok Build for:

- Complex multi-step agentic tasks (large features, big refactors, multi-file architectural work)
- Tasks that benefit from explicit plan → review → approve workflow
- Parallel subagents exploring or implementing different parts of a problem at once
- Terminal-first workflows, headless mode, scripting, or automation of coding tasks
- Large existing repos where deep agentic exploration + clean diffs matter
- Full-prototype security/correctness reviews with parallel explore agents

### Decision rule

- **Cursor** = default for day-to-day work and most editing.
- **Grok Build** = heavy agentic lifting, complex planning, parallel work, or terminal/automation.
- **Hybrid is normal and encouraged** (e.g. Grok as ACP backend inside Cursor, or side-by-side).

Both tools must still follow these standards: tests, CI, PRs, no secrets in code, observability, security, etc.

### Hybrid & enforcement

- Put key rules + checklist into `AGENTS.md` (or `.grok/rules/`) at every project root.
- Grok Build loads `~/.grok/AGENTS.md` globally and project `AGENTS.md` automatically.
- Before declaring non-trivial work done: run lint, typecheck, tests; verify checklist; report status.
- Use skills/hooks for active enforcement where available.
- Headless: `grok -p "check standards and report"`.
- Sync after standards updates:

```bash
cp ~/.grok/AGENTS.md /path/to/repo/AGENTS.md
# or: cp solid-systems-standards/AGENTS.md /path/to/repo/AGENTS.md
```

---

## Architecture Guidelines

- Follow 12-factor app principles where they apply
- Keep business logic testable and separate from framework glue
- Database migrations live in the repo
- Prefer managed services early; self-host only when there is a clear reason
- Small, focused pull requests
- Pure domain math (money, workflows) unit-tested without React/Next

---

## CI, lockfiles, and npm version

GitHub Actions Node 22 often ships **npm 10**. Local machines may run **npm 11+**. Lockfiles can diverge.

**On Node apps when CI uses npm 10:**

1. Pin `"packageManager": "npm@10.9.8"` (or current CI-compatible pin) in `package.json`.
2. Enable Corepack in CI before `npm ci` (see `templates/ci-node.yml`).
3. Regenerate lockfiles with the same npm CI uses.
4. Prefer Dependabot grouped updates; ignore majors unless planned.

Copy `templates/ci-node.yml` into new projects as `.github/workflows/ci.yml`. Prefer concurrency groups and Node via `.nvmrc` when useful.

---

## Process

- Conventional commits preferred (or clear, consistent messages)
- Architecture Decision Records (ADRs) for non-obvious choices → `/docs/adr`
- Update the [solid-systems-standards](https://github.com/chadbergndsu/solid-systems-standards) repo when you learn something that should apply to all future systems
- Security lessons from any product (e.g. FloorPath auth/money review) land here first, then sync outward

---

## Why this exists

Most systems fail from neglect, missing tests, secret leaks, weak auth, or zero observability — not from missing fancy architecture.

Follow this checklist on every project. It keeps technical debt low, protects ownership, and frees time to build things that actually matter.

---

*Solid Systems Standards v1.5 — 2026-08-04*
*Global Grok path: `~/.grok/AGENTS.md` · Project path: `<repo>/AGENTS.md`*
