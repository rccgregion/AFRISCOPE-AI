import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Request, Response } from 'express';
import { getVercelApp } from '../server/vercel.js';

/**
 * Single Vercel function for ALL /api/* routes.
 *
 * Outside Next.js, Vercel compiles api/[...path].ts as a single-segment
 * route (^/api/([^/]+)$), so nested paths like /api/auth/auto fall through
 * to Vercel's built-in 404. vercel.json rewrites /api/(.*) to /api (this
 * function) instead; the function receives the original URL, so Express
 * routes exactly as in local development.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getVercelApp();
    // Vercel may already have parsed JSON bodies; prevent body-parser from
    // re-reading a consumed stream.
    if (req.body !== undefined) {
      (req as unknown as Request).body = req.body;
      (req as unknown as Request & { _body?: boolean })._body = true;
    }
    return app(req as unknown as Request, res as unknown as Response);
  } catch (error) {
    const status = (error as { status?: number }).status || 503;
    // Redact any credentials that might appear in connection errors.
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage.replace(/:\/\/[^@\s]+@/g, '://[redacted]@').slice(0, 500);
    // Include a truncated stack so init failures can be pinpointed from the
    // response alone. Paths are serverless function paths; no credentials
    // are in stacks.
    const rawStack = error instanceof Error ? (error.stack ?? '') : '';
    const stack = rawStack
      .replace(/:\/\/[^@\s]+@/g, '://[redacted]@')
      .split('\n')
      .slice(0, 12)
      .join('\n')
      .slice(0, 2000);
    console.error(
      JSON.stringify({
        event: 'vercel.api_unavailable',
        status,
        name: error instanceof Error ? error.name : typeof error,
        message,
        stack: stack.slice(0, 2000),
      }),
    );
    return res.status(status).json({
      error:
        status === 503
          ? 'The API database is not configured or unavailable. Check DATABASE_URL/POSTGRES_URL, apply migrations, and review Vercel function logs.'
          : 'The API request could not be completed.',
      detail: message,
      stack,
    });
  }
}
