import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Plus,
  ArrowRight,
  RefreshCw,
  Copy,
  Mail,
  Download,
  HardDrive,
  Radio,
  Zap,
  Clock,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api } from '../lib/api';
import {
  PageHeader,
  Panel,
  Table,
  Button,
  Badge,
  Notice,
  Modal,
  KeyValue,
  Empty,
} from '../components/ui';
import { ROLES, ROLE_LABELS, type Role, AS_OF } from '../../shared/domain';
export function Projects() {
  const { workspace, project, selectProject, allow } = useStore();
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow="PROJECTS & WORKSPACES"
        title="Organise around the decision."
        description="Each project connects its people, data, analysis, recommendations, and evidence."
      >
        <Button onClick={() => setCreate(true)} disabled={!allow('manage')}>
          <Plus size={16} />
          Create project
        </Button>
      </PageHeader>
      <div className="project-grid">
        {workspace?.projects.map((p) => (
          <section className={p.id === project?.id ? 'current' : ''} key={p.id}>
            <div>
              <span className="file-icon">
                <Building2 size={23} />
              </span>
              <Badge tone={p.id === project?.id ? 'green' : 'neutral'}>
                {p.id === project?.id ? 'Current workspace' : p.status}
              </Badge>
            </div>
            <span className="eyebrow">{p.sector}</span>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <small>{p.countries}</small>
            <Button
              variant={p.id === project?.id ? 'primary' : 'secondary'}
              onClick={() => selectProject(p.id)}
            >
              Open workspace <ArrowRight size={15} />
            </Button>
          </section>
        ))}
      </div>
      {!workspace?.projects.length && (
        <Empty
          title="Create your first project"
          description="Your organisation is private. Add a project, invite collaborators, and import authorised data."
          action={<Button onClick={() => setCreate(true)}>Create project</Button>}
        />
      )}
      <Notice>
        Project membership controls access. Organisation administrators can manage projects in their
        organisation; demo access never unlocks private organisations.
      </Notice>
      {create && <CreateProject onClose={() => setCreate(false)} />}
    </>
  );
}
function CreateProject({ onClose }: { onClose: () => void }) {
  const { workspace } = useStore(),
    action = useAction();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a project workspace" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const ok = await action(
            () => api('/projects', { body: Object.fromEntries(f) }),
            'Project created with your management membership',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <label className="form-field">
          <span>Organisation</span>
          <select name="organisation_id">
            {workspace?.organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Project title *</span>
          <input name="title" required maxLength={160} />
        </label>
        <label className="form-field">
          <span>Sector</span>
          <select name="sector">
            {['Public health', 'Public finance', 'Development programmes', 'Cross-sector'].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label className="form-field">
          <span>Countries / geography *</span>
          <input name="countries" required />
        </label>
        <label className="form-field">
          <span>Decision problem / description</span>
          <textarea name="description" rows={3} />
        </label>
        <Notice>
          The project starts empty. No synthetic records are silently added to a private workspace.
        </Notice>
        <Button busy={busy}>
          Create project <ArrowRight size={15} />
        </Button>
      </form>
    </Modal>
  );
}
export function Administration() {
  const { data, workspace, project, role, allow, notify } = useStore(),
    action = useAction();
  const [invite, setInvite] = useState(false),
    [reset, setReset] = useState(false),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState(false);
  const isDemo = workspace?.organisations.some(
    (o) => o.id === project?.organisation_id && o.is_demo,
  );
  return (
    <>
      <PageHeader
        eyebrow="ORGANISATION ADMINISTRATION"
        title="The right access. Clear accountability."
        description="Manage project roles, invitations, and the synthetic demonstration environment."
      />
      <div className="two-col">
        <Panel title="Organisation profile">
          <KeyValue
            data={{
              Organisation: workspace?.organisations.find((o) => o.id === project?.organisation_id)
                ?.name,
              'Your role': ROLE_LABELS[role],
              Environment: isDemo ? 'Synthetic demonstration' : 'Private organisation',
              'Access model': 'Organisation + project membership',
              Database: 'Persistent PostgreSQL-compatible storage',
            }}
          />
        </Panel>
        <Panel title="Role responsibilities">
          <KeyValue
            data={{
              'Programme manager': 'Projects, data, analysis and proposals.',
              'Data analyst': 'Imports, validation and experiments.',
              Operator: 'Assigned actions and alert updates.',
              Reviewer: 'Independent approval and rejection.',
              Executive: 'Read-only project evidence.',
            }}
          />
        </Panel>
      </div>
      <Panel
        title="Project membership"
        subtitle="Role changes apply to the current project. Organisation administrators retain organisation-wide access."
        action={
          <Button disabled={!allow('admin')} onClick={() => setInvite(true)}>
            <Plus size={15} />
            Invite member
          </Button>
        }
      >
        <Table
          rows={data?.members || []}
          columns={[
            { key: 'full_name', label: 'Member' },
            { key: 'email', label: 'Email' },
            {
              key: 'role',
              label: 'Project role',
              render: (r) =>
                allow('admin') ? (
                  <select
                    aria-label={'Role for ' + r.full_name}
                    defaultValue={r.role}
                    onChange={async (e) => {
                      await action(
                        () =>
                          api('/memberships/' + r.id, {
                            method: 'PATCH',
                            body: { role: e.target.value },
                          }),
                        'Project role updated',
                      );
                    }}
                  >
                    {ROLES.filter((x) => x !== 'platform_admin').map((x) => (
                      <option key={x} value={x}>
                        {ROLE_LABELS[x]}
                      </option>
                    ))}
                  </select>
                ) : (
                  ROLE_LABELS[r.role as Role]
                ),
            },
            {
              key: 'access',
              label: 'Access',
              render: () => <Badge tone="green">Project scoped</Badge>,
            },
          ]}
        />
      </Panel>
      <div className="two-col">
        <Panel title="Dataset access policy">
          <div className="p-5">
            <Notice>
              Project members can read project datasets. Internal data is never public. External LLM
              access is disabled by default and only approved, non-sensitive evidence may be sent.
            </Notice>
            <Link to="/governance" className="text-button mt-4">
              Review privacy controls <ArrowRight size={14} />
            </Link>
          </div>
        </Panel>
        <Panel title="Demonstration reset">
          <div className="p-5">
            <p className="muted">
              Reset only the synthetic organisation to its fixed-seed state. Uploaded demo records
              and decisions are removed. Private organisations are not affected.
            </p>
            <Button
              variant="danger"
              className="mt-4"
              disabled={!isDemo || !allow('admin')}
              onClick={() => setReset(true)}
            >
              <RefreshCw size={15} />
              Reset demonstration
            </Button>
          </div>
        </Panel>
      </div>
      {invite && (
        <Modal
          title="Invite a project member"
          onClose={() => {
            setInvite(false);
            setLink('');
          }}
        >
          {link ? (
            <div className="form-stack">
              <Notice tone="success">
                Invitation created. Email is not configured; deliver this single-use link securely
                to the intended recipient.
              </Notice>
              <code className="invite-link">{location.origin + link}</code>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(location.origin + link);
                  notify('Invitation link copied');
                }}
              >
                <Copy size={15} />
                Copy invitation
              </Button>
            </div>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  const r = await api<{ path: string }>(
                    '/projects/' + project!.id + '/invitations',
                    { body: Object.fromEntries(f) },
                  );
                  setLink(r.path);
                } catch (e) {
                  notify((e as Error).message, true);
                }
                setBusy(false);
              }}
            >
              <label className="form-field">
                <span>Email address *</span>
                <input name="email" type="email" required />
              </label>
              <label className="form-field">
                <span>Role</span>
                <select name="role">
                  {ROLES.filter((r) => !['platform_admin', 'organisation_admin'].includes(r)).map(
                    (r) => (
                      <option value={r} key={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <Notice>
                The invitation expires in 72 hours. It grants access to this organisation's projects
                at the selected role.
              </Notice>
              <Button busy={busy}>
                <Mail size={15} />
                Create invitation
              </Button>
            </form>
          )}
        </Modal>
      )}
      {reset && (
        <Modal title="Reset synthetic demonstration?" onClose={() => setReset(false)}>
          <Notice tone="warning">
            This removes changes to demo data, reports, experiments, learning progress and
            approvals, then recreates the original seed. All demo sessions are signed out.
          </Notice>
          <label className="form-field mt-5">
            <span>Type RESET to confirm</span>
            <input id="reset-confirm" placeholder="RESET" />
          </label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                if (
                  (document.getElementById('reset-confirm') as HTMLInputElement).value !== 'RESET'
                ) {
                  notify('Type RESET to confirm', true);
                  return;
                }
                setBusy(true);
                try {
                  await api('/demo/reset', { body: {} });
                  location.assign('/');
                } catch (e) {
                  notify((e as Error).message, true);
                  setBusy(false);
                }
              }}
            >
              Reset demo data
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const { workspace, project, allow, notify, realtimeConnected } = useStore(),
    action = useAction();
  const [health, setHealth] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [backups, setBackups] = useState<Row[]>([]),
    [backupBusy, setBackupBusy] = useState(false),
    [connectors, setConnectors] = useState<Row[]>([]),
    [syncBusy, setSyncBusy] = useState<string | null>(null),
    [webhookBusy, setWebhookBusy] = useState(false);

  const loadBackups = useCallback(() => {
    api<{ backups: Row[] }>('/backups')
      .then((res) => setBackups(res.backups || []))
      .catch((e) => notify(e.message, true));
  }, [notify]);

  const loadConnectors = useCallback(() => {
    if (!project) return;
    api<{ connectors: Row[] }>('/projects/' + project.id + '/connectors')
      .then((res) => setConnectors(res.connectors || []))
      .catch((e) => notify(e.message, true));
  }, [project, notify]);

  useEffect(() => {
    api<Row>('/health')
      .then(setHealth)
      .catch((e) => notify(e.message, true));
    loadBackups();
  }, [notify, loadBackups]);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);
  return (
    <>
      <PageHeader
        eyebrow="SETTINGS"
        title="A workspace you can trust."
        description="Account preferences, operational rules, connections, and data handling."
      />
      <div className="two-col">
        <Panel title="Account">
          <KeyValue
            data={{
              Name: workspace?.user.full_name,
              Username: workspace?.user.username || '—',
              Email: workspace?.user.email || '—',
              Session: 'HttpOnly cookie · 8-hour expiry',
              Authentication: 'Secure local session or explicit demo access',
            }}
          />
          <div className="p-5">
            <Notice>
              Password recovery requires administrator identity verification. Email recovery is not
              configured in this environment.
            </Notice>
          </div>
        </Panel>
        <Panel title="Notification preferences">
          <form
            className="form-stack p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action(
                () =>
                  api('/settings/profile', {
                    method: 'PATCH',
                    body: {
                      full_name: f.get('full_name'),
                      preferences: { in_app_alerts: f.get('alerts') === 'on', email_digest: false },
                    },
                  }),
                'Account preferences saved',
              );
            }}
          >
            <label className="form-field">
              <span>Display name</span>
              <input name="full_name" defaultValue={workspace?.user.full_name} required />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="alerts" defaultChecked />
              Show in-app operational alerts
            </label>
            <small className="muted">
              Email delivery is not connected; no email subscription is implied.
            </small>
            <Button variant="secondary">Save preferences</Button>
          </form>
        </Panel>
      </div>
      <Panel
        title="Operational risk rules"
        subtitle="Changes are versioned in the audit trail. Recalculate analyses after updating rules."
      >
        <form
          className="p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            await action(
              () =>
                api('/projects/' + project!.id + '/settings', {
                  method: 'PATCH',
                  body: { stock_threshold_days: Number(f.get('threshold')), as_of: f.get('as_of') },
                }),
              'Risk rules saved; recalculate to generate fresh evidence',
            );
            setBusy(false);
          }}
        >
          <div className="two-col">
            <label className="form-field">
              <span>Stock review threshold (days)</span>
              <input
                name="threshold"
                type="number"
                min="7"
                max="90"
                defaultValue={project?.settings.stock_threshold_days || 21}
                required
              />
            </label>
            <label className="form-field">
              <span>Operational reference date</span>
              <input
                name="as_of"
                type="date"
                defaultValue={String(project?.settings.as_of || AS_OF).slice(0, 10)}
                required
              />
            </label>
          </div>
          <Button disabled={!allow('manage')} busy={busy}>
            Save rule configuration
          </Button>
        </form>
      </Panel>
      <Panel
        title="Automated recurring backups & disaster recovery"
        subtitle="Full database state snapshots with SHA-256 integrity validation. Automated recurring schedule runs every 6 hours."
        action={
          <Button
            variant="secondary"
            busy={backupBusy}
            disabled={!allow('manage')}
            onClick={async () => {
              setBackupBusy(true);
              try {
                await api('/backups', { body: { label: 'Manual administrative backup' } });
                notify('Snapshot created successfully');
                loadBackups();
              } catch (e) {
                notify((e as Error).message, true);
              }
              setBackupBusy(false);
            }}
          >
            <HardDrive size={15} />
            Create snapshot now
          </Button>
        }
      >
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900/40 rounded-lg border border-neutral-800">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                <Clock size={18} />
              </span>
              <div>
                <strong className="text-sm font-medium text-neutral-100">Recurring schedule active</strong>
                <p className="text-xs text-neutral-400">Snapshots automatically taken every 6 hours. Rolling 12 backups retained.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="green">Automated 6h</Badge>
              <Badge tone="neutral">SHA-256 Checksum</Badge>
            </div>
          </div>

          <Table
            rows={backups}
            label="Database backups"
            columns={[
              {
                key: 'filename',
                label: 'Snapshot file',
                render: (r) => (
                  <div className="cell-stack">
                    <strong className="text-xs font-mono">{r.filename}</strong>
                    <span className="text-xs text-neutral-400">
                      {new Date(r.created_at).toLocaleString()} · {r.backup_type}
                    </span>
                  </div>
                ),
              },
              {
                key: 'record_count',
                label: 'Records',
                render: (r) => `${(r.record_count || 0).toLocaleString()} rows`,
              },
              {
                key: 'file_size_bytes',
                label: 'Size',
                render: (r) => `${((r.file_size_bytes || 0) / 1024).toFixed(1)} KB`,
              },
              {
                key: 'checksum',
                label: 'SHA-256',
                render: (r) => (
                  <code className="text-xs font-mono text-neutral-400">
                    {r.checksum ? r.checksum.slice(0, 14) + '…' : '—'}
                  </code>
                ),
              },
              {
                key: 'download',
                label: 'Action',
                render: (r) => (
                  <a
                    href={`/api/backups/${encodeURIComponent(r.filename)}/download`}
                    download={r.filename}
                    className="btn btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    Download
                  </a>
                ),
              },
            ]}
          />
        </div>
      </Panel>
      <Panel
        title="Live data connectors & Supabase webhooks"
        subtitle="Connect real external logistics APIs and receive real-time database change events via Webhooks & Server-Sent Events (SSE)."
        action={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border ${
                realtimeConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
              }`}
            >
              <Radio size={12} className={realtimeConnected ? 'animate-pulse' : ''} />
              {realtimeConnected ? 'Live SSE Connected' : 'Connecting Stream...'}
            </span>
          </div>
        }
      >
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-neutral-900/40 rounded-lg border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Supabase Database Webhook Intake
                </span>
                <Badge tone="green">Active</Badge>
              </div>
              <p className="text-xs text-neutral-300">
                Incoming HTTP Webhooks push instant updates to browser sessions via real-time SSE stream.
              </p>
              <div className="bg-black/40 rounded p-2 text-xs font-mono text-emerald-400 flex items-center justify-between">
                <span>POST /api/webhooks/supabase</span>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-white"
                  onClick={async () => {
                    await navigator.clipboard.writeText(location.origin + '/api/webhooks/supabase');
                    notify('Webhook URL copied to clipboard');
                  }}
                >
                  <Copy size={13} />
                </button>
              </div>
              <div className="pt-2 flex justify-end">
                <Button
                  variant="secondary"
                  busy={webhookBusy}
                  onClick={async () => {
                    setWebhookBusy(true);
                    try {
                      await api('/webhooks/supabase', {
                        body: {
                          type: 'operational_alerts',
                          event: 'INSERT',
                          record: {
                            id: 'wh-sim-' + Date.now(),
                            title: 'Live Webhook Push: Stock Buffer Threshold Alert',
                            facility_name: 'St. Jude District Hospital',
                            risk: 'Elevated',
                            triggering_condition: 'Real-time database webhook push simulation',
                            category: 'stock_buffer',
                          },
                        },
                      });
                      notify('Test webhook ping sent! Check top notification stream.');
                    } catch (e) {
                      notify((e as Error).message, true);
                    }
                    setWebhookBusy(false);
                  }}
                >
                  <Zap size={13} />
                  Simulate Webhook Push
                </Button>
              </div>
            </div>

            <div className="p-4 bg-neutral-900/40 rounded-lg border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Webhook Subscriptions
                </span>
                <Badge tone="neutral">3 Subscriptions</Badge>
              </div>
              <ul className="text-xs text-neutral-300 space-y-1.5 pt-1">
                <li className="flex items-center justify-between py-1 border-b border-neutral-800/60">
                  <span className="font-mono text-neutral-200">operational_alerts</span>
                  <span className="text-emerald-400">INSERT / UPDATE</span>
                </li>
                <li className="flex items-center justify-between py-1 border-b border-neutral-800/60">
                  <span className="font-mono text-neutral-200">inventory_records</span>
                  <span className="text-emerald-400">INSERT / UPDATE</span>
                </li>
                <li className="flex items-center justify-between py-1">
                  <span className="font-mono text-neutral-200">recommendations</span>
                  <span className="text-emerald-400">STATE CHANGE</span>
                </li>
              </ul>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-neutral-200 mb-3">Live Data Connectors</h4>
            <Table
              rows={connectors}
              label="Data connectors"
              columns={[
                {
                  key: 'name',
                  label: 'Connector',
                  render: (r) => (
                    <div className="cell-stack">
                      <strong>{r.name}</strong>
                      <span className="text-xs text-neutral-400 font-mono">{r.type}</span>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r) => (
                    <Badge tone={r.status === 'active' ? 'green' : 'neutral'}>
                      {r.status}
                    </Badge>
                  ),
                },
                {
                  key: 'last_sync_at',
                  label: 'Last sync',
                  render: (r) => (r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : 'Never'),
                },
                {
                  key: 'sync_count',
                  label: 'Sync count',
                  render: (r) => `${r.sync_count || 0} runs`,
                },
                {
                  key: 'action',
                  label: 'Trigger',
                  render: (r) => (
                    <Button
                      variant="secondary"
                      busy={syncBusy === r.id}
                      disabled={!allow('manage')}
                      onClick={async () => {
                        setSyncBusy(r.id);
                        try {
                          await api(
                            `/projects/${project!.id}/connectors/${r.id}/sync`,
                            { body: {} },
                          );
                          notify(`Live connector "${r.name}" synced successfully`);
                          loadConnectors();
                        } catch (e) {
                          notify((e as Error).message, true);
                        }
                        setSyncBusy(null);
                      }}
                    >
                      <RefreshCw size={13} />
                      Sync now
                    </Button>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </Panel>
      <div className="two-col">
        <Panel title="Environment & connection status">
          <KeyValue
            data={{
              API: health?.status === 'ok' ? 'Connected' : 'Unavailable',
              Database: health?.database || 'Checking…',
              'Explanation service': health?.llm || 'Checking…',
              'Demo access': health?.demo ? 'Enabled' : 'Disabled',
              'File limits': 'CSV 5 MB / XLSX 2 MB / 5,000 rows',
              'External provider credentials': 'Server-side only; never sent to the browser',
            }}
          />
          <div className="p-5">
            <Badge tone="green">No external credentials required for local mode</Badge>
          </div>
        </Panel>
        <Panel title="Data retention & privacy">
          <div className="p-5 stack">
            <p className="muted">
              Demo resets delete and recreate synthetic operational records. Private projects are
              retained until an authorised deletion request. Before production use, configure a
              verified retention schedule, backup expiry, and legal hold process.
            </p>
            <Notice tone="warning">
              No automatic retention deletion job or legal-hold service is configured. Do not upload
              sensitive real records until these controls are implemented and reviewed.
            </Notice>
            <Link className="text-button" to="/governance">
              Open governance policies <ArrowRight size={14} />
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
