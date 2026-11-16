/**
 * Live data connectors.
 *
 * Integrity rule: this module never reports a number it did not observe. A
 * connector is only usable once a user has supplied an HTTPS endpoint; until
 * then it reports `not_configured`, has no run history, and sync is blocked. A
 * configured connector makes one real HTTP request with a timeout and reports
 * the actual HTTP status, byte size and parsed row count — or the actual error.
 *
 * Nothing here writes received rows into project tables. Ingesting external rows
 * has to go through the validated import path, which records provenance, so a
 * sync is a *fetch and report*, not a silent mutation.
 */
import type { Database } from './db.js';
import { realtime } from './realtime.js';

export type ConnectorSource =
  | 'supabase_direct'
  | 'dhis2_api'
  | 'openlmis_feed'
  | 'custom_webhook';

export type ConnectorMode = 'not_configured' | 'configured';

export interface ConnectorConfig {
  endpoint_url?: string;
  auth_header?: string;
  target_entity?: string;
  polling_interval_minutes?: number;
  auto_sync?: boolean;
  last_error?: string;
}

export interface ConnectorView {
  id: string;
  project_id: string;
  name: string;
  type: ConnectorSource;
  source_type: ConnectorSource;
  config: ConnectorConfig;
  /** 'not_configured' | 'configured' */
  connection_mode: ConnectorMode;
  /** never_run | ok | error | not_configured */
  status: string;
  status_label: string;
  /** Host only — never a full URL that could carry credentials. */
  endpoint_host: string | null;
  can_sync: boolean;
  sync_blocked_reason: string | null;
  last_run_at: string | null;
  last_run_rows: number | null;
  last_run_ok: boolean | null;
  http_status: number | null;
  last_error: string | null;
  run_count: number;
  // Legacy keys kept so older clients keep rendering. They are now truthful:
  // null until a real run has produced a real count.
  last_sync_at: string | null;
  rows_synced: number | null;
  sync_count: number;
  created_at: string;
}

export type SyncOutcome = {
  ok: boolean;
  status: 'not_configured' | 'ok' | 'error';
  rowsSynced: number | null;
  message: string;
  http_status: number | null;
  duration_ms: number | null;
  /** Rows are reported, never written by this endpoint. */
  rows_written: 0;
  connector: { id: string; name: string; status: string; type: string };
};

const DEFAULT_TIMEOUT_MS = 15000;

/** Only the host is exposed; credentials and paths never leave the server. */
function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return null;
  }
}

function configuredEndpoint(config: ConnectorConfig | null | undefined): string | null {
  const url = config?.endpoint_url?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function toView(r: Record<string, unknown>): ConnectorView {
  const config = (r.config as ConnectorConfig) || {};
  const configured = String(r.connection_mode ?? 'not_configured') === 'configured';
  const endpoint = configured ? configuredEndpoint(config) : null;
  const can_sync = configured && endpoint !== null;
  const lastRunAt = r.last_run_at ? String(r.last_run_at) : null;
  const lastRunRows = r.last_run_rows === null || r.last_run_rows === undefined ? null : Number(r.last_run_rows);
  const lastRunOk = r.last_run_ok === null || r.last_run_ok === undefined ? null : Boolean(r.last_run_ok);
  const status = !can_sync ? 'not_configured' : lastRunOk === null ? 'never_run' : lastRunOk ? 'ok' : 'error';
  const label =
    status === 'not_configured'
      ? 'Not configured'
      : status === 'never_run'
        ? 'Configured, never run'
        : status === 'ok'
          ? 'Last run succeeded'
          : 'Last run failed';
  return {
    id: String(r.id),
    project_id: String(r.project_id),
    name: String(r.name),
    type: r.source_type as ConnectorSource,
    source_type: r.source_type as ConnectorSource,
    config,
    connection_mode: can_sync ? 'configured' : 'not_configured',
    status,
    status_label: label,
    endpoint_host: endpoint ? hostOf(endpoint) : null,
    can_sync,
    sync_blocked_reason: can_sync
      ? null
      : 'No HTTPS endpoint has been configured for this connector. Add one under "Configure" before syncing — the platform will not invent connector results.',
    last_run_at: lastRunAt,
    last_run_rows: lastRunRows,
    last_run_ok: lastRunOk,
    http_status: r.http_status === null || r.http_status === undefined ? null : Number(r.http_status),
    last_error: r.last_error ? String(r.last_error) : null,
    run_count: Number(r.run_count ?? 0),
    last_sync_at: lastRunAt,
    rows_synced: lastRunRows,
    sync_count: Number(r.run_count ?? 0),
    created_at: String(r.created_at),
  };
}

/**
 * Seed the three connector slots for a project as unconfigured. No endpoint, no
 * counters, no timestamps: nothing here claims a sync has happened.
 */
async function ensureConnectorSlots(db: Database, projectId: string) {
  await db.admin(async (c) => {
    const existing = await c.query(
      'select count(*)::int as n from live_data_connectors where project_id=$1',
      [projectId],
    );
    if (Number(existing.rows[0]?.n ?? 0) > 0) return;
    await c.query(
      `insert into live_data_connectors
         (project_id, name, source_type, config, sync_status, rows_synced, last_sync_at,
          connection_mode, run_count)
       values
         ($1, 'Supabase Direct Sync', 'supabase_direct', '{"target_table":"inventory_records"}'::jsonb,
          'Not configured', 0, null, 'not_configured', 0),
         ($1, 'DHIS2 Aggregate Tracker', 'dhis2_api', '{}'::jsonb,
          'Not configured', 0, null, 'not_configured', 0),
         ($1, 'OpenLMIS Supply Feed', 'openlmis_feed', '{}'::jsonb,
          'Not configured', 0, null, 'not_configured', 0)`,
      [projectId],
    );
  });
}

export async function listConnectors(db: Database, projectId: string): Promise<ConnectorView[]> {
  await ensureConnectorSlots(db, projectId);
  return db.admin(async (c) => {
    const res = await c.query(
      `select * from live_data_connectors where project_id=$1 order by created_at`,
      [projectId],
    );
    return res.rows.map(toView);
  });
}

export async function createConnector(
  db: Database,
  projectId: string,
  data: { name: string; source_type: ConnectorSource; config: ConnectorConfig },
): Promise<ConnectorView> {
  const endpoint = configuredEndpoint(data.config);
  return db.admin(async (c) => {
    const res = await c.query(
      `insert into live_data_connectors
         (project_id, name, source_type, config, sync_status, rows_synced, last_sync_at,
          connection_mode, run_count)
       values ($1,$2,$3,$4,$5,0,null,$6,0) returning *`,
      [
        projectId,
        data.name,
        data.source_type,
        JSON.stringify(data.config || {}),
        endpoint ? 'Configured' : 'Not configured',
        endpoint ? 'configured' : 'not_configured',
      ],
    );
    return toView(res.rows[0]);
  });
}

/** Configure (or clear) a connector endpoint. */
export async function configureConnector(
  db: Database,
  projectId: string,
  connectorId: string,
  config: ConnectorConfig,
): Promise<ConnectorView> {
  const endpoint = configuredEndpoint(config);
  return db.admin(async (c) => {
    const res = await c.query(
      `update live_data_connectors
          set config=$3, connection_mode=$4, sync_status=$5,
              last_run_ok=null, last_run_rows=null, last_run_at=null, last_error=null,
              http_status=null, run_count=0, updated_at=now()
        where id=$1 and project_id=$2
        returning *`,
      [
        connectorId,
        projectId,
        JSON.stringify(config || {}),
        endpoint ? 'configured' : 'not_configured',
        endpoint ? 'Configured' : 'Not configured',
      ],
    );
    if (!res.rows[0]) throw Object.assign(new Error('Connector not found'), { status: 404 });
    return toView(res.rows[0]);
  });
}

function countRows(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['rows', 'data', 'results', 'records', 'items']) {
      if (Array.isArray(obj[key])) return (obj[key] as unknown[]).length;
    }
    if (Array.isArray(obj.metrics)) return (obj.metrics as unknown[]).length;
    return 1;
  }
  return 0;
}

/**
 * Run one real HTTP request against the configured endpoint.
 *
 * `fetchImpl` is injectable so tests can prove both the failing and the
 * succeeding path without network access.
 */
export async function syncConnector(
  db: Database,
  connectorId: string,
  projectId: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SyncOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const connector = await db.admin(async (c) => {
    const res = await c.query(
      'select * from live_data_connectors where id=$1 and project_id=$2',
      [connectorId, projectId],
    );
    return res.rows[0];
  });
  if (!connector) throw Object.assign(new Error('Live data connector not found'), { status: 404 });

  const view = toView(connector);
  const endpoint = configuredEndpoint(view.config);

  if (!view.can_sync || !endpoint) {
    // No request, no counter, no success message, nothing broadcast.
    return {
      ok: false,
      status: 'not_configured',
      rowsSynced: null,
      message: `Connector "${view.name}" is not configured. Add an HTTPS endpoint before syncing. No request was made and no rows were reported.`,
      http_status: null,
      duration_ms: null,
      rows_written: 0,
      connector: { id: view.id, name: view.name, status: 'not_configured', type: view.type },
    };
  }

  const started = Date.now();
  let httpStatus: number | null = null;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        ...(view.config.auth_header ? { Authorization: view.config.auth_header } : {}),
      },
    });
    httpStatus = response.status;
    const text = await response.text();
    if (!response.ok) throw new Error(`Endpoint responded ${response.status} ${response.statusText}`.trim());
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Endpoint did not return JSON; no rows could be counted');
    }
    const rows = countRows(parsed);
    const duration = Date.now() - started;
    await recordRun(db, connectorId, projectId, {
      ok: true,
      rows,
      httpStatus,
      error: null,
    });
    realtime.broadcast({
      id: `sync-${Date.now()}`,
      type: 'sync:completed',
      timestamp: new Date().toISOString(),
      projectId,
      title: 'Connector fetch succeeded',
      message: `Connector "${view.name}" returned HTTP ${httpStatus} with ${rows} row(s) in ${duration} ms. Nothing was written; use the import flow to validate these rows.`,
      severity: 'info',
      data: { connectorId, rows, httpStatus, duration_ms: duration, rows_written: 0 },
    });
    return {
      ok: true,
      status: 'ok',
      rowsSynced: rows,
      message: `Connector "${view.name}" returned HTTP ${httpStatus}: ${rows} row(s) parsed in ${duration} ms. Rows were not written — import them through validation to record provenance.`,
      http_status: httpStatus,
      duration_ms: duration,
      rows_written: 0,
      connector: { id: view.id, name: view.name, status: 'ok', type: view.type },
    };
  } catch (error) {
    const duration = Date.now() - started;
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `Request timed out after ${timeoutMs} ms`
        : error instanceof Error
          ? error.message
          : String(error);
    await recordRun(db, connectorId, projectId, {
      ok: false,
      rows: null,
      httpStatus,
      error: reason.slice(0, 400),
    });
    realtime.broadcast({
      id: `sync-${Date.now()}`,
      type: 'sync:failed',
      timestamp: new Date().toISOString(),
      projectId,
      title: 'Connector fetch failed',
      message: `Connector "${view.name}" failed: ${reason}`,
      severity: 'warning',
      data: { connectorId, httpStatus, duration_ms: duration },
    });
    return {
      ok: false,
      status: 'error',
      rowsSynced: null,
      message: `Connector "${view.name}" failed: ${reason}. No rows were received or reported.`,
      http_status: httpStatus,
      duration_ms: duration,
      rows_written: 0,
      connector: { id: view.id, name: view.name, status: 'error', type: view.type },
    };
  }
}

async function recordRun(
  db: Database,
  connectorId: string,
  projectId: string,
  run: { ok: boolean; rows: number | null; httpStatus: number | null; error: string | null },
) {
  await db.admin(async (c) => {
    await c.query(
      `update live_data_connectors
          set last_run_at=now(),
              last_run_ok=$3::boolean,
              last_run_rows=$4::integer,
              http_status=$5::integer,
              last_error=$6::text,
              sync_status=$7::text,
              run_count=run_count+1,
              updated_at=now(),
              last_sync_at = case when $3::boolean then now() else last_sync_at end,
              rows_synced = case
                when $3::boolean and $4::integer is not null then $4::integer
                else rows_synced
              end
        where id=$1::uuid and project_id=$2::uuid`,
      [
        connectorId,
        projectId,
        run.ok,
        run.rows,
        run.httpStatus,
        run.error,
        run.ok ? 'Synced' : 'Error',
      ],
    );
  });
}

/** Test hook: the timeout used for a real request. */
export const CONNECTOR_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
