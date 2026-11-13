# Changelog

## Unreleased

- Batched migration statements (one query per file) so first-boot against networked PostgreSQL completes within serverless time limits; added a 5s timeout to the Supabase health check so `/api/health` can never hang.

- Added Supabase integration: `@supabase/server` + `@supabase/supabase-js`, `server/supabase.ts` connectivity helper reported by `/api/health`, `SUPABASE_DATABASE_URL` support in the Vercel adapter, env-driven admin bootstrap (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), Node pinned to `22.x`, and removal of the hardcoded seed password fallback.

- Added Vercel serverless API adapter, external PostgreSQL default via `DATABASE_URL`/`POSTGRES_URL`, and deployment guide.

- Added username-based sign-in alongside email sign-in, optional usernames on invitation acceptance, and username-aware administrator bootstrap.

## 0.1.0 — 2026-10-29

Initial synthetic demonstration MVP: six connected modules, three analytical workflows, PostgreSQL/PGlite persistence with RLS migrations, versioned CSV/XLSX ingestion, grounded local assistant, human review, learning assessments, reports, exports, deterministic evaluations, and automated tests. No live LLM, email provider, Supabase project, or external operational integration was executed. See README for verified results and limitations.
