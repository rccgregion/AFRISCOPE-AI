export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch('/api' + path, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-AfriScope-Request': '1' },
    body:
      options.body instanceof FormData
        ? undefined
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
    signal: options.signal,
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: 'Connection unavailable. Please try again.' }));
    throw new ApiError(data.error || 'Request failed', response.status);
  }
  return response.json();
}
export async function upload(path: string, file: File, kind: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  const response = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-AfriScope-Request': '1' },
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
    'text/csv',
  );
}
