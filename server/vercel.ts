import type { Express } from 'express';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { seedDemo, ensureUser } from './seed.js';

let appPromise: Promise<Express> | null = null;

/** Cached Express app for Vercel Node functions. Requires external PostgreSQL. */
export function getVercelApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = initialise().catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

async function initialise(): Promise<Express> {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;
  if (!url) {
    throw Object.assign(
      new Error(
        'DATABASE_URL (or POSTGRES_URL / SUPABASE_DATABASE_URL) is required on Vercel. PGlite local disk is not supported in serverless functions.',
      ),
      { status: 503 },
    );
  }
  const db = await createDatabase({ url, max: 1 });
  // Demo seeding is opt-in on serverless because it is a large one-time write.
  if (process.env.DEMO_ENABLED === 'true' && process.env.VERCEL_SEED_DEMO === 'true') {
    await seedDemo(db);
  }
  // Env-driven admin bootstrap (idempotent upsert). The password comes from
  // the ADMIN_PASSWORD environment variable and is never committed.
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_USERNAME) {
    await ensureUser(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  }
  return createApp(db);
}
