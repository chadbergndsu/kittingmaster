# AGENTS.md — Solid Systems Standards

You must follow the Solid Systems Standards on every task in this repository.

Full standards: https://github.com/chadbergndsu/solid-systems-standards

## Core Rules (non-negotiable)

1. Simplicity first — do not add complexity that is not required.
2. Own the code and data — prefer portable stacks, minimize lock-in.
3. Automate quality — linting, tests, and CI are mandatory.
4. Never commit secrets. Ever.
5. Observability is required — if it can fail silently, fix that.
6. Document the non-obvious.

## Mandatory Checklist (verify before declaring any non-trivial work done)

- [ ] Clear README exists (purpose, stack, setup, architecture, deploy)
- [ ] `.env.example` present and real secrets are never committed
- [ ] Proper `.gitignore`
- [ ] Linter + formatter configured
- [ ] Type safety (TypeScript preferred for web)
- [ ] Basic tests for core logic
- [ ] Secrets only in platform env vars / GitHub Secrets
- [ ] Error tracking (Sentry or equivalent) considered
- [ ] Deployment from Git only
- [ ] HTTPS only
- [ ] Basic monitoring / health check considered

## Deployment Defaults

- Default for web frontends / light fullstack → **Vercel**
- Use AWS (or hybrid) only when requirements clearly demand it (heavy compute, specific services, compliance, extreme scale)
- Prefer portable code so migration remains possible

## AI Tool Preference

- Cursor = default for day-to-day interactive work
- Grok Build = preferred for complex multi-step, large refactors, parallel agent work, or terminal/automation tasks
- Hybrid is allowed

