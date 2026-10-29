import type { Express } from 'express';
import { createDatabase } from './db';
import { createApp } from './app';
import { seedDemo } from './seed';

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
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw Object.assign(
      new Error(
        'DATABASE_URL (or POSTGRES_URL) is required on Vercel. PGlite local disk is not supported in serverless functions.',
      ),
      { status: 503 },
    );
  }
  const db = await createDatabase({ url, max: 1 });
  // Demo seeding is opt-in on serverless because it is a large one-time write.
  if (process.env.DEMO_ENABLED === 'true' && process.env.VERCEL_SEED_DEMO === 'true') {
    await seedDemo(db);
  }
  return createApp(db);
}
