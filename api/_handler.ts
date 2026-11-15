import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Request, Response } from 'express';
import { getVercelApp } from '../server/vercel.js';

/**
 * Shared Vercel function handler. Explicit per-route files (api/auth/auto.ts,
 * etc.) delegate here so Vercel routes them reliably; the catch-all
 * api/[...path].ts remains for all other /api/* paths.
 */
export async function handleApi(req: VercelRequest, res: VercelResponse, apiPath: string) {
  try {
    const app = await getVercelApp();
    // Normalise to the Express path (e.g. /api/auth/auto).
    const url = new URL(req.url || apiPath, 'http://vercel.local');
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue;
      if (Array.isArray(value)) for (const v of value) query.append(key, String(v));
      else if (value !== undefined) query.append(key, String(value));
    }
    // Preserve original query string (e.g. ?token= for SSE).
    const rawQuery = url.search ? url.search.slice(1) : '';
    const finalQuery = rawQuery || query.toString();
    req.url = apiPath + (finalQuery ? '?' + finalQuery : '');
    if (req.body !== undefined) {
      (req as unknown as Request).body = req.body;
      (req as unknown as Request & { _body?: boolean })._body = true;
    }
    return app(req as unknown as Request, res as unknown as Response);
  } catch (error) {
    const status = (error as { status?: number }).status || 503;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage.replace(/:\/\/[^@\s]+@/g, '://[redacted]@').slice(0, 500);
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
