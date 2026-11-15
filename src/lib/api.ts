export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// The session token is stored in localStorage so it survives tab closes and
// browser restarts. /api/auth/auto is only called when no token is stored or
// when the server rejects the stored token with a 401 (clear + re-auth once,
// then retry the request once — never loop).
const TOKEN_KEY = 'afriscope_token';

export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AfriScope-Request': '1',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch('/api' + path, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers,
    body:
      options.body instanceof FormData
        ? undefined
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
    signal: options.signal,
  });
}

let authPromise: Promise<string | null> | null = null;

/**
 * Obtain a session token via /api/auth/auto. POST is primary; GET is a
 * fallback for environments where POST bodies are unreliable. Concurrent
 * callers share a single in-flight request. Returns the stored token, or
 * null when authentication is unavailable (e.g. demo mode off or server
 * unreachable) — callers must treat null as "no session", not an error.
 */
export async function ensureAuth(): Promise<string | null> {
  const existing = getToken();
  if (existing) return existing;
  if (authPromise) return authPromise;
  authPromise = (async () => {
    try {
      const res = await rawRequest('/auth/auto', { method: 'POST', body: {} });
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        if (data?.token) {
          setToken(data.token);
          return data.token;
        }
      }
    } catch {
      // fall through to GET fallback
    }
    try {
      const res = await rawRequest('/auth/auto', { method: 'GET' });
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        if (data?.token) {
          setToken(data.token);
          return data.token;
        }
      }
    } catch {
      // ignore — no session available
    }
    return null;
  })();
  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isAuthPath = path.startsWith('/auth/');
  let response = await rawRequest(path, options);
  if (response.status === 401 && !isAuthPath) {
    // Stored token rejected: clear it, re-authenticate once, retry once.
    clearToken();
    const token = await ensureAuth();
    if (token) response = await rawRequest(path, options);
  }
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (HTTP ${response.status}).`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      if (response.status === 404)
        message = 'API endpoint not found. Check the deployment routing and function logs.';
      else if (response.status >= 500)
        message = 'The API is unavailable. Check the database configuration and deployment logs.';
    }
    throw new ApiError(message, response.status);
  }
  const data = (await response.json()) as T;
  if (
    data &&
    typeof data === 'object' &&
    'token' in data &&
    typeof (data as Record<string, unknown>).token === 'string'
  ) {
    setToken((data as Record<string, unknown>).token as string);
  }
  return data;
}
export async function upload(path: string, file: File, kind: string) {
  const token = getToken();
  const headers: Record<string, string> = { 'X-AfriScope-Request': '1' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  const response = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Upload failed', response.status);
  return data;
}
export function download(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  download(
    filename,
    [keys.map(escape).join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join(
      '\n',
    ),
  );
}
