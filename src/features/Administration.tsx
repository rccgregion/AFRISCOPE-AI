import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, ArrowRight, RefreshCw, Copy, Mail } from 'lucide-react';
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
  const { workspace, project, allow, notify } = useStore(),
    action = useAction();
  const [health, setHealth] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Row>('/health')
      .then(setHealth)
      .catch((e) => notify(e.message, true));
  }, [notify]);
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
              Email: workspace?.user.email,
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
