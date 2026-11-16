import { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, Copy, Zap, Clock, HardDrive, Download, ShieldCheck } from 'lucide-react';
import { useStore, type Row } from '../lib/store';
import { api } from '../lib/api';
import { Badge, Button, Modal, Notice, Panel, Table } from './ui';

/**
 * Settings → external connectors.
 *
 * Truth rules enforced here:
 *  - a connector that has no HTTPS endpoint is "Not configured" with no run
 *    counters, no timestamps and a disabled Sync button that explains why;
 *  - a sync reports only what a real request returned, or the real failure;
 *  - the stream badge reflects the actual EventSource state.
 */
export function ConnectorPanel() {
  const { project, allow, notify, realtimeState } = useStore();
  const [connectors, setConnectors] = useState<Row[]>([]);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [configure, setConfigure] = useState<Row | null>(null);
  const [webhookBusy, setWebhookBusy] = useState(false);

  const load = useCallback(() => {
    if (!project) return;
    api<{ connectors: Row[] }>('/projects/' + project.id + '/connectors')
      .then((res) => setConnectors(res.connectors || []))
      .catch((e) => notify(e.message, true));
  }, [project, notify]);

  useEffect(() => {
    load();
  }, [load]);

  if (!project) return null;
  const unconfigured = connectors.filter((c) => c.connection_mode !== 'configured').length;

  return (
    <>
      <Panel
        title="External connectors"
        subtitle="External connectors are not configured. No external system is connected to this workspace."
        action={
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border ${
              realtimeState === 'connected'
                ? 'realtime-connected'
                : realtimeState === 'reconnecting'
                  ? 'realtime-reconnecting'
                  : 'realtime-polling'
            }`}
          >
            <Radio size={12} className={realtimeState === 'connected' ? 'animate-pulse' : ''} />
            {realtimeState === 'connected'
              ? 'Realtime: connected'
              : realtimeState === 'reconnecting'
                ? 'Realtime: reconnecting'
                : 'Realtime: off (polling)'}
          </span>
        }
      >
        <div className="p-5 stack">
          <Notice tone="warning">
            {unconfigured === connectors.length
              ? `${connectors.length} connector slot(s) exist and none has an endpoint. Until one is configured, Sync is disabled and no connector can report rows.`
              : `${unconfigured} connector slot(s) still have no endpoint.`}{' '}
            A configured connector makes one real HTTP request and reports only what came back; it
            never writes rows into project data — imports go through validation so provenance is
            recorded.
          </Notice>

          <div className="connector-grid">
            {connectors.map((c) => (
              <div className="connector-card" key={c.id}>
                <div className="connector-head">
                  <div>
                    <strong>{c.name}</strong>
                    <span className="connector-type">{c.type}</span>
                  </div>
                  <Badge tone={c.connection_mode === 'configured' ? 'green' : 'neutral'}>
                    {c.status_label}
                  </Badge>
                </div>
                <dl className="connector-meta">
                  <div>
                    <dt>Endpoint</dt>
                    <dd>{c.endpoint_host || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt>Last run</dt>
                    <dd>
                      {c.last_run_at ? new Date(c.last_run_at).toLocaleString() : 'Never run'}
                    </dd>
                  </div>
                  <div>
                    <dt>Rows returned</dt>
                    <dd>
                      {c.last_run_rows === null || c.last_run_rows === undefined
                        ? '—'
                        : c.last_run_rows}
                    </dd>
                  </div>
                  <div>
                    <dt>Runs recorded</dt>
                    <dd>{c.run_count}</dd>
                  </div>
                </dl>
                {c.last_error && <p className="connector-error">Last error: {c.last_error}</p>}
                <div className="connector-actions">
                  <Button
                    variant="secondary"
                    disabled={!allow('manage')}
                    onClick={() => setConfigure(c)}
                  >
                    Configure
                  </Button>
                  <span
                    title={
                      c.can_sync
                        ? 'Makes one real request to the configured endpoint'
                        : (c.sync_blocked_reason as string)
                    }
                  >
                    <Button
                      variant="secondary"
                      busy={syncBusy === c.id}
                      disabled={!allow('manage') || !c.can_sync}
                      aria-describedby={`sync-reason-${c.id}`}
                      onClick={async () => {
                        setSyncBusy(c.id);
                        try {
                          const r = await api<{ message: string }>(
                            `/projects/${project.id}/connectors/${c.id}/sync`,
                            { body: {} },
                          );
                          notify(r.message);
                        } catch (e) {
                          notify((e as Error).message, true);
                        }
                        setSyncBusy(null);
                        load();
                      }}
                    >
                      <RefreshCw size={13} /> Sync now
                    </Button>
                  </span>
                </div>
                {!c.can_sync && (
                  <p className="sync-reason" id={`sync-reason-${c.id}`}>
                    Sync disabled: no endpoint configured. Add an HTTPS endpoint under Configure.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="connector-demo">
            <div>
              <strong>Demo only · webhook intake</strong>
              <p className="muted small">
                <code>POST /api/webhooks/supabase</code> re-broadcasts a payload you supply to
                connected browsers. It writes nothing to project data, and every event it emits is
                labelled &ldquo;Demo only&rdquo;.
              </p>
            </div>
            <div className="inline-actions">
              <Button
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(location.origin + '/api/webhooks/supabase');
                  notify('Webhook URL copied to clipboard');
                }}
              >
                <Copy size={13} /> Copy URL
              </Button>
              <Button
                variant="secondary"
                busy={webhookBusy}
                disabled={!allow('manage')}
                onClick={async () => {
                  setWebhookBusy(true);
                  try {
                    const r = await api<{ note?: string }>('/webhooks/supabase', {
                      body: {
                        table: 'operational_alerts',
                        event: 'INSERT',
                        record: {
                          title: 'Demo webhook event',
                          triggering_condition: 'Demonstration payload supplied by the browser',
                        },
                      },
                    });
                    notify(r.note || 'Demo event broadcast. Nothing was written.');
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                  setWebhookBusy(false);
                }}
                title="Broadcasts a labelled demo event. Writes no rows."
              >
                <Zap size={13} /> Simulate Webhook Push (demo only)
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {configure && (
        <Modal title={`Configure ${configure.name}`} onClose={() => setConfigure(null)}>
          <Notice>
            Only an HTTPS endpoint is accepted. The URL is stored on the server and never sent back
            to the browser in full — only its host is shown. Leave both fields empty to clear the
            configuration and return the connector to &ldquo;Not configured&rdquo;.
          </Notice>
          <form
            className="form-stack mt-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api(`/projects/${project.id}/connectors/${configure.id}`, {
                  method: 'PATCH',
                  body: {
                    endpoint_url: String(f.get('endpoint_url') || '') || null,
                    auth_header: String(f.get('auth_header') || '') || null,
                  },
                });
                notify('Connector configuration saved');
                setConfigure(null);
                load();
              } catch (err) {
                notify((err as Error).message, true);
              }
            }}
          >
            <label className="form-field">
              <span>HTTPS endpoint</span>
              <input
                name="endpoint_url"
                type="url"
                placeholder="https://example.org/api/stock"
                defaultValue=""
              />
            </label>
            <label className="form-field">
              <span>Authorization header value (optional)</span>
              <input name="auth_header" type="password" placeholder="Bearer …" defaultValue="" />
            </label>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setConfigure(null)}>
                Cancel
              </Button>
              <Button>Save configuration</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type Scheduler = {
  configured: boolean;
  mode: string;
  interval_hours: number;
  last_automatic_at: string | null;
  last_automatic_status: string | null;
  last_run_at: string | null;
  note: string;
};

/** Settings → backups, with honest scheduler state and a working empty state. */
export function BackupPanel() {
  const { allow, notify } = useStore();
  const [backups, setBackups] = useState<Row[]>([]);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ backups: Row[]; scheduler: Scheduler }>('/backups')
      .then((res) => {
        setBackups(res.backups || []);
        setScheduler(res.scheduler || null);
      })
      .catch((e) => notify(e.message, true));
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Panel
      title="Database snapshots"
      subtitle="A snapshot copies every project table to a SHA-256 checked JSON document. It is not a database backup you can restore from this screen — see Data retention below."
      action={
        <Button
          variant="secondary"
          busy={busy}
          disabled={!allow('manage')}
          onClick={async () => {
            setBusy(true);
            try {
              await api('/backups', { body: { label: 'Manual administrative backup' } });
              notify('Snapshot created');
              load();
            } catch (e) {
              notify((e as Error).message, true);
            }
            setBusy(false);
          }}
        >
          <HardDrive size={15} /> Create snapshot now
        </Button>
      }
    >
      <div className="p-5 stack">
        <div
          className={`scheduler-card ${scheduler?.configured ? 'scheduler-on' : 'scheduler-off'}`}
        >
          <span className="scheduler-icon">
            <Clock size={18} />
          </span>
          <div>
            <strong>
              {scheduler === null
                ? 'Checking scheduler…'
                : scheduler.configured
                  ? `Automatic snapshots: every ${scheduler.interval_hours} hours`
                  : 'Automatic backups: not configured'}
            </strong>
            <p className="muted small">{scheduler?.note}</p>
            {scheduler?.last_automatic_at && (
              <p className="muted small">
                Last automatic run {new Date(scheduler.last_automatic_at).toLocaleString()} ·{' '}
                {scheduler.last_automatic_status}
              </p>
            )}
            {scheduler?.last_run_at && (
              <p className="muted small">
                Most recent snapshot (any type) {new Date(scheduler.last_run_at).toLocaleString()}
              </p>
            )}
            {!scheduler?.configured && (
              <p className="muted small">
                To schedule snapshots, either run the standalone server (which enables the six-hour
                in-process schedule) or add a Vercel Cron job that calls{' '}
                <code>POST /api/backups</code> with an administrator session. Nothing on this page
                will claim a schedule that is not running.
              </p>
            )}
          </div>
        </div>

        {backups.length ? (
          <Table
            rows={backups}
            label="Database snapshots"
            columns={[
              {
                key: 'filename',
                label: 'Snapshot',
                render: (r) => (
                  <div className="cell-stack">
                    <strong className="mono small">{r.filename}</strong>
                    <span className="muted small">
                      {new Date(r.created_at).toLocaleString()} · {r.backup_type}
                    </span>
                  </div>
                ),
              },
              {
                key: 'record_count',
                label: 'Records',
                render: (r) => `${Number(r.record_count || 0).toLocaleString()} rows`,
              },
              {
                key: 'checksum',
                label: 'SHA-256',
                render: (r) => (
                  <code className="mono small">
                    {r.checksum ? `${r.checksum.slice(0, 12)}…` : '—'}
                  </code>
                ),
              },
              {
                key: 'download',
                label: '',
                render: (r) => (
                  <a
                    href={`/api/backups/${encodeURIComponent(r.filename)}/download`}
                    download={r.filename}
                    className="text-button"
                  >
                    <Download size={13} /> Download
                  </a>
                ),
              },
            ]}
          />
        ) : (
          <div className="empty-data">
            <ShieldCheck size={22} />
            <h4>No snapshots yet</h4>
            <p>
              Nothing has been captured in this deployment. Create a snapshot now to record the
              current state of every project table, or configure a schedule as described above.
            </p>
            <div className="empty-actions">
              <Button
                disabled={!allow('manage')}
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('/backups', { body: { label: 'Manual administrative backup' } });
                    notify('Snapshot created');
                    load();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                  setBusy(false);
                }}
              >
                Create snapshot now
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
