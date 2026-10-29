# Contributing

## Setup

Node 22+, npm, Python 3.11+ (standard library only for data generation). `npm ci`; `cp .env.example .env`; `npm run demo:reset -- --confirm-demo-reset`; `npm run dev`.

## Quality gate

`npm run check` runs typecheck, lint, unit/integration tests, and production build. Also run `npm run format:check`, `npm run test:e2e`, `npm run evaluate`, and `npm audit --omit=dev`. Install Playwright Chromium before E2E. CI runs these checks without external credentials.

## Change discipline

- Keep arithmetic deterministic and tested; never move it into an LLM.
- Add migrations forward-only; do not rewrite an applied migration. Regenerate the initial migration only in a fresh pre-release schema workflow.
- Preserve organisation/project isolation, immutable evidence, and auditability.
- Add rejection/limitation paths, not just happy paths.
- Label synthetic data and assumptions. Do not add fabricated clients, impact, citations, or model metrics.
- Keep secrets server-side; update `.env.example` with safe placeholders only.
- Update the data dictionary and evaluation docs when schemas/methods change.
- Use the fixed Arena session branch for this workspace; open a PR rather than pushing directly to main.

## Tests

Unit tests cover pure analytics and validation. Integration tests use a fresh in-memory database and real Express routes/RLS. Playwright runs against a production build on port 3100 with a separate `.data/e2e` database and includes automated axe checks. Do not point E2E or reset commands at a private database.
