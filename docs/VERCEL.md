# Deploying to Vercel

The browser app is static Vite output; the API runs as a Vercel Node function in `api/[...path].ts`. **PGlite local disk is not supported on Vercel.** Use an external PostgreSQL database (Supabase, Vercel Postgres/Neon, RDS, etc.).

## 1. Provision PostgreSQL (Supabase)

In the Supabase Dashboard, open **Project Settings → Database → Connection string** and copy the URI. It looks like:

```text
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

This connection string is different from the Supabase API keys (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). The app's data layer connects to Postgres directly with this string; the API keys are used by `server/supabase.ts` for Supabase Auth/REST connectivity checks.

Migrations run automatically on first request (see `server/db.ts`), so no separate migrate step is required when the database user has sufficient privileges.

## 2. Bootstrap the account

Either run the seed from a trusted machine:

```bash
npm ci
DATABASE_URL="postgresql://..." ADMIN_USERNAME="declareola" ADMIN_PASSWORD="choose-a-strong-password" npm run db:seed
```

or set `ADMIN_USERNAME` + `ADMIN_PASSWORD` as Vercel environment variables — the serverless initialiser (`server/vercel.ts`) performs an idempotent admin upsert on first request. Do not commit the password.

Optional synthetic demo data can be seeded once by setting `DEMO_ENABLED=true` and `VERCEL_SEED_DEMO=true` for the first deployment, then setting `VERCEL_SEED_DEMO=false` after it succeeds.

## 3. Configure Vercel environment variables

Set at least:

```text
DATABASE_URL=postgresql://...
APP_ORIGIN=https://YOUR-PROJECT.vercel.app
DEMO_ENABLED=false
LLM_EXTERNAL_ENABLED=false
```

`POSTGRES_URL`, `SUPABASE_DATABASE_URL`, and `SUPABASE_DB_URL` are accepted as alternatives to `DATABASE_URL`. Supabase API integration variables:

```text
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_JWKS_URL=https://[project-ref].supabase.co/auth/v1/.well-known/jwks.json
```

Never expose database credentials as `VITE_*` variables.

## 4. Deploy

```bash
vercel deploy --prod
```

`vercel.json` builds the Vite app into `dist`, routes `/api/*` to the serverless Express handler, and serves the SPA for other routes. The function includes `supabase/migrations/**` so first-run migration checks can read the migration files. Node is pinned to `22.x` via `engines` in `package.json`.

## 5. Verify

```bash
curl https://YOUR-PROJECT.vercel.app/api/health
```

Expected JSON includes `status: ok` and `supabase: configured`. Then sign in with the bootstrapped username/password.

## Troubleshooting

- `503` / “API database is not configured or unavailable”: set `DATABASE_URL` (or `POSTGRES_URL` / `SUPABASE_DATABASE_URL`), check database network/TLS settings, and inspect Vercel function logs.
- `500 FUNCTION_INVOCATION_FAILED` on `/api/*`: check Vercel → Project → Logs for the function error. Common causes are a Node version mismatch (the project pins `22.x`) or a missing environment variable.
- `404` on `/api/health`: confirm the deployment includes `api/[...path].ts` and `vercel.json`.
- Login returns 401: the account exists only in the database where you ran bootstrap. Run the bootstrap against the production `DATABASE_URL`.
- CSRF/origin errors: set `APP_ORIGIN` to the exact HTTPS origin users visit.
- Large imports may exceed serverless limits; use the long-lived Node/Docker deployment for heavy operational workloads.
