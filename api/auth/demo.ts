import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApi } from '../_handler.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleApi(req, res, '/api/auth/demo');
}
