# Deploying to Vercel

The browser app is static Vite output; the API runs as a Vercel Node function in `api/[...path].ts`. **PGlite local disk is not supported on Vercel.** Use an external PostgreSQL database (Vercel Postgres/Neon, Supabase, RDS, etc.).

## 1. Provision PostgreSQL

Create a PostgreSQL database and copy its connection string. Use TLS, for example:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

## 2. Apply migrations and bootstrap the account

From a trusted machine with Node 22 and the repository checked out:

```bash
npm ci
DATABASE_URL="postgresql://..." npm run db:migrate
DATABASE_URL="postgresql://..." ADMIN_USERNAME="declareola" ADMIN_PASSWORD="choose-a-strong-password" npm run db:seed
```

Do not commit the password. The bootstrap creates a private organisation administrator. If you prefer email login, use `ADMIN_EMAIL` instead of `ADMIN_USERNAME`.

Optional synthetic demo data can be seeded once:

```bash
DATABASE_URL="postgresql://..." npm run db:seed
```

or, on Vercel only, set `DEMO_ENABLED=true` and `VERCEL_SEED_DEMO=true` for the first deployment, then set `VERCEL_SEED_DEMO=false` after it succeeds.

## 3. Configure Vercel environment variables

Set at least:

```text
DATABASE_URL=postgresql://...
APP_ORIGIN=https://YOUR-PROJECT.vercel.app
DEMO_ENABLED=false
LLM_EXTERNAL_ENABLED=false
```

`POSTGRES_URL` is accepted as an alternative to `DATABASE_URL`. Never expose database credentials as `VITE_*` variables.

## 4. Deploy

```bash
vercel deploy --prod
```

`vercel.json` builds the Vite app into `dist`, routes `/api/*` to the serverless Express handler, and serves the SPA for other routes. The function includes `supabase/migrations/**` so first-run migration checks can read the migration files.

## 5. Verify

```bash
curl https://YOUR-PROJECT.vercel.app/api/health
```

Expected JSON includes `status: ok`. Then sign in with the bootstrapped username/password.

## Troubleshooting

- `503` / “API database is not configured or unavailable”: set `DATABASE_URL` or `POSTGRES_URL`, check database network/TLS settings, and inspect Vercel function logs.
- `404` on `/api/health`: confirm the deployment includes `api/[...path].ts` and `vercel.json`.
- Login returns 401: the account exists only in the database where you ran bootstrap. Run the bootstrap against the production `DATABASE_URL`.
- CSRF/origin errors: set `APP_ORIGIN` to the exact HTTPS origin users visit.
- Large imports may exceed serverless limits; use the long-lived Node/Docker deployment for heavy operational workloads.
