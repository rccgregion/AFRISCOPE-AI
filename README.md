# AfriScope AI

**Evidence before action.** A functional, synthetic decision-support workspace for African development systems: medicine availability, public finance flows, and constrained intervention prioritisation.

> All demonstration countries, facilities, financial records, and intervention assumptions are fictional. No real government, patient, partner, or Gates Foundation data is represented. The app supports human decisions; it never transfers stock or money.

## What works

- **Six connected modules:** Problem Scoping, Experiment Lab, Data Intelligence, Programme Operations, Learning Academy, Responsible AI/Governance; plus Overview, Reports, Projects, Administration, Settings, public overview, sign-in/invitations, and guide.
- **Medicine:** versioned inventory, usable-stock/coverage/expiry rules, time-aware MA/SES forecast comparison, constrained redistribution candidates, alerts, evidence, and review.
- **Finance:** currency-separated budget/release/procurement/expenditure reconciliation, overdue-stage rules, visible unmatched transactions; no FX conversion or fraud inference.
- **Planning:** exact allocation over up to 16 packages, budget/geography/equity/duration/dependency constraints, scenario comparison, sensitivity, and infeasibility explanations.
- **Data:** CSV/XLSX preview, explicit mapping, server validation, immutable accepted versions, retained rejected rows, quality reports, dictionaries, and exports. Fully rejected imports do not replace analytical data.
- **Governance:** seven roles, organisation/project RLS, independent reasoned approvals, self-approval/self-implementation prohibition, implementation/outcome records, append-only audit/evidence/approvals.
- **Assistant:** project-scoped evidence retrieval and explicitly labelled deterministic local explanations without a key. Optional external explanation adapter is implemented but was not live-tested.
- **Learning/reports:** server-graded private assessments, evidence-backed Markdown reports, CSV exports, global search, responsive UI, and automated accessibility checks.

## Quick start

Requires Node 22+ and npm. Python 3.11+ is only needed to regenerate fixtures.

```bash
npm ci
cp .env.example .env
npm run demo:reset -- --confirm-demo-reset
npm run dev
```

Open `http://localhost:3000`. Choose **Explore the live workspace**. “Live” means functional, not real/live data. The demo reference date is **2026-09-30**. PGlite persists locally under `.data/afriscope`; no database service or LLM key is required.

### Production-style local run

```bash
npm run build
APP_ORIGIN=http://localhost:3000 npm start
```

Production cookies require HTTPS when accessed remotely. For a container:

```bash
docker build -t afriscope-ai .
docker run --rm -p 3000:3000 -v afriscope-data:/app/.data \
  -e APP_ORIGIN=http://localhost:3000 afriscope-ai
```

Docker was not available in the build environment; the Dockerfile is provided but not execution-tested. For a private deployment use PostgreSQL with TLS, `DEMO_ENABLED=false`, exact `APP_ORIGIN`, HTTPS, backups, and the checklist in [docs/SECURITY.md](docs/SECURITY.md). Set `DATABASE_URL` to use the PostgreSQL adapter; it shares migrations/RLS but was not tested against an external server here.

## Verify

```bash
npm run check                 # typecheck + lint + 89 unit/integration tests + build
npm run format:check
npx playwright install chromium
npm run test:e2e              # 12 browser workflows, including axe checks
npm run evaluate              # deterministic measured evaluation
npm run audit:a11y            # with the app running; writes accessibility.json
npm audit --omit=dev
```

E2E uses a separate `.data/e2e` database and production build on port 3100. Do not point tests/reset at private data. CI is in `.github/workflows/ci.yml`.

### Measured results

- **89 unit/integration tests** passing: 59 unit + 30 API/database integration.
- **12 Playwright tests** passing, including import/rejection history, independent review, finance separation, scenario creation, learning, assistant grounding, read-only enforcement, mobile overflow, and automated WCAG A/AA checks.
- **Held-out synthetic forecasts:** 48 series, 432 predictions/method. MA(4): MAE **38.3999**, WAPE **0.17150**, bias **+15.0828**. SES(0.3): MAE **37.0094**, WAPE **0.16529**, bias **+10.5260**.
- **Defect fixture:** 8/8 rows rejected; no stock mutation or replacement version.
- **Local assistant regressions:** 8/8 narrow grounding/refusal checks; **no live LLM called**. This is not a comprehensive safety certification.
- **Accessibility:** axe WCAG 2/2.1 A/AA scans found zero violations on the seven audited routes; automated checks are not full accessibility certification.

Details and limitations: [MODEL_EVALUATION](docs/MODEL_EVALUATION.md), [AI_EVALUATION](docs/AI_EVALUATION.md), `evaluations/results.json`, `evaluations/accessibility.json`.

## Data, migrations, and reset

Seven forward migrations live in `supabase/migrations/`; the database applies them automatically on startup. `npm run db:migrate` applies them explicitly. `npm run db:seed` seeds the demo, or bootstraps a private admin when `ADMIN_PASSWORD` and `ADMIN_USERNAME` or `ADMIN_EMAIL` are supplied. Sign-in accepts a username or email plus password. `npm run data:generate` regenerates 12 fixed-seed CSVs (seed 20260930).

Reset only the synthetic organisation:

```bash
npm run demo:reset -- --confirm-demo-reset
```

In Settings, a demo organisation administrator can type `RESET`. For CLI reset, stop the dev/server process first: PGlite allows only one process per database directory. Reset clears demo sessions and does not delete private organisations. Demo role switching is for evaluation only; disable demo access before private use.

## Vercel

See [docs/VERCEL.md](docs/VERCEL.md). Vercel requires an external PostgreSQL database (`DATABASE_URL` or `POSTGRES_URL`); PGlite local disk is not supported in serverless functions.

## Configuration

See `.env.example`. Important variables: `DATABASE_PATH` or `DATABASE_URL`, `PORT`, `HOST`, `APP_ORIGIN`, `DEMO_ENABLED`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LLM_EXTERNAL_ENABLED`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. Secrets stay server-side. External AI requires explicit enablement plus a key and HTTPS; the default local assistant never pretends to be a live model.

## Documentation

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Data dictionary](docs/DATA_DICTIONARY.md) · [Data quality](docs/DATA_QUALITY.md) · [Model evaluation](docs/MODEL_EVALUATION.md) · [AI evaluation](docs/AI_EVALUATION.md) · [Responsible AI](docs/RESPONSIBLE_AI.md) · [Experiment log](docs/EXPERIMENT_LOG.md) · [User guide](docs/USER_GUIDE.md) · [Training playbook](docs/TRAINING_PLAYBOOK.md) · [Decisions](docs/DECISIONS.md) · [Security](docs/SECURITY.md) · [Contributing](docs/CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Limitations and next priorities

Not production-certified. No live LLM, Supabase project, external PostgreSQL server, email provider, Docker runtime, or real operational integration was available/executed. Email delivery/recovery, MFA/SSO, distributed throttling, retention jobs, backup/restore drills, pagination/background jobs, and larger solvers remain incomplete. Synthetic forecasts/benefits are not real-world evidence; no human productivity study was performed.

Next three engineering priorities:

1. Deploy against hardened PostgreSQL/Supabase with TLS, backups, private identity/recovery, and production RLS/penetration tests.
2. Add background import/analysis jobs, pagination, retention/monitoring, and a tested larger allocation solver.
3. Run human-reviewed external-LLM privacy/adversarial/faithfulness evaluations and real stakeholder/accessibility studies before private deployment.

## GitHub

Work is on `arena/bb428b97-afriscope-ai` in `rccgregion/AFRISCOPE-AI`. Push that branch and open a PR to `main`; CI runs without external credentials. Never commit `.env`, `.data`, tokens, or private uploads.
