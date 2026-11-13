import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Lazily-created Supabase admin client for the Supabase integration.
 * Uses SUPABASE_URL + SUPABASE_SECRET_KEY (falls back to the publishable key).
 * Returns null when Supabase is not configured. The application data layer
 * connects to Supabase Postgres directly via DATABASE_URL; this client is for
 * Supabase Auth/REST operations and connectivity checks.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Best-effort connectivity check. Never throws and never hangs. */
export async function supabaseStatus(): Promise<'configured' | 'unreachable' | 'unconfigured'> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'unconfigured';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), 5000);
    });
    const result = await Promise.race([supabase.auth.getUser(), timeout]);
    if (result === 'timeout') return 'unreachable';
    // getUser returns an error when no session exists; that still proves the
    // Supabase Auth endpoint is reachable with the configured keys.
    void result.error;
    return 'configured';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
