import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Request, Response } from 'express';
import { getVercelApp } from '../server/vercel';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getVercelApp();
    normalisePath(req);
    // Vercel may already have parsed JSON bodies; prevent body-parser from re-reading a consumed stream.
    if (req.body !== undefined) {
      (req as unknown as Request).body = req.body;
      (req as unknown as Request & { _body?: boolean })._body = true;
    }
    return app(req as unknown as Request, res as unknown as Response);
  } catch (error) {
    const status = (error as { status?: number }).status || 503;
    console.error(
      JSON.stringify({
        event: 'vercel.api_unavailable',
        status,
        name: (error as Error).name,
      }),
    );
    return res.status(status).json({
      error:
        status === 503
          ? 'The API database is not configured or unavailable. Check DATABASE_URL/POSTGRES_URL, apply migrations, and review Vercel function logs.'
          : 'The API request could not be completed.',
    });
  }
}

function normalisePath(req: VercelRequest) {
  const raw = req.url || '/';
  const url = new URL(raw, 'http://vercel.local');
  if (url.pathname.startsWith('/api/') && !url.pathname.includes('[...path]')) return;
  const path = req.query.path;
  const segments = Array.isArray(path) ? path.join('/') : path ? String(path) : '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) for (const v of value) query.append(key, String(v));
    else if (value !== undefined) query.append(key, String(value));
  }
  url.pathname = '/api/' + segments;
  url.search = query.toString();
  req.url = url.pathname + (url.search ? '?' + url.search : '');
}
