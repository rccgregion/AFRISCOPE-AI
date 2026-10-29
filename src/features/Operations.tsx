import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  RefreshCw,
  Download,
  Plus,
  ArrowRight,
  Package,
  Truck,
  CircleAlert,
  ShieldCheck,
  ArrowUpRight,
  GitPullRequest,
  CheckCircle2,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, exportCSV } from '../lib/api';
import {
  PageHeader,
  Panel,
  Tabs,
  Table,
  Button,
  Status,
  Badge,
  Notice,
  Modal,
  KeyValue,
  Empty,
  JsonView,
} from '../components/ui';
import {
  RecordForm,
  CreateRecommendation,
  EvidenceDetail,
  RecommendationDetail,
} from '../components/workflow';
import { dateLabel, money, number } from '../../shared/domain';
export function Operations() {
  const { data, project, allow, notify } = useStore(),
    action = useAction();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'Medicine supply';
  const [stock, setStock] = useState<Row[] | null>(null),
    [finance, setFinance] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [transfer, setTransfer] = useState<Row | null>(null),
    [alert, setAlert] = useState<Row | null>(null),
    [task, setTask] = useState(false),
    [review, setReview] = useState<Row | null>(null),
    [draft, setDraft] = useState(false),
    [evidence, setEvidence] = useState<string | null>(null),
    [country, setCountry] = useState('All countries'),
    [risk, setRisk] = useState('All risks'),
    [currency, setCurrency] = useState('NGN');
  useEffect(() => {
    if (!project) return;
    let active = true;
    setStock(null);
    setFinance(null);
    Promise.all([
      api<{ rows: Row[] }>('/projects/' + project.id + '/stock'),
      api<Row>('/projects/' + project.id + '/finance'),
    ])
      .then(([s, f]) => {
        if (active) {
          setStock(s.rows);
          setFinance(f);
          if (f?.by_currency[0]) setCurrency(f.by_currency[0].currency);
        }
      })
      .catch((e) => notify(e.message, true));
    return () => {
      active = false;
    };
  }, [project, data?.analytical_runs.length, notify]);
  const tabs = [
    'Medicine supply',
    'Finance',
    'Procurement',
    'Alerts',
    'Actions & milestones',
    'Approvals',
    'Audit history',
  ];
  const filtered = (stock || []).filter(
    (r) =>
      (country === 'All countries' || r.country === country) &&
      (risk === 'All risks' || r.risk === risk),
  );
  const recalculate = async () => {
    setBusy(true);
    await action(
      () =>
        api('/projects/' + project!.id + '/analysis', {
          body: { kind: tab === 'Finance' || tab === 'Procurement' ? 'finance' : 'inventory' },
        }),
      'Analysis saved with a new evidence record',
    );
    setBusy(false);
  };
  return (
    <>
      <PageHeader
        eyebrow="PROGRAMME OPERATIONS"
        title="Keep delivery moving."
        description="Trace supply, funding, and implementation signals back to the records that created them."
      >
        <Button
          variant="secondary"
          onClick={() =>
            exportCSV('afriscope-operational-alerts.csv', data?.operational_alerts || [])
          }
        >
          <Download size={16} />
          Export alerts
        </Button>
        <Button onClick={recalculate} busy={busy} disabled={!allow('data')}>
          <RefreshCw size={16} />
          Recalculate
        </Button>
      </PageHeader>
      <Tabs items={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'Medicine supply' && (
        <>
          <Notice>
            Data is a fixed synthetic snapshot, not a live facility feed. Coverage uses usable stock
            divided by average daily consumption over four complete weeks.
          </Notice>
          <div className="section-toolbar">
            <div className="inline-fields">
              <label>
                Country
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {['All countries', ...new Set((stock || []).map((r) => r.country))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Risk level
                <select value={risk} onChange={(e) => setRisk(e.target.value)}>
                  {['All risks', 'Critical', 'Elevated', 'Stable', 'Unknown', 'No demand'].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <Button
              variant="secondary"
              onClick={() => exportCSV('medicine-coverage.csv', filtered)}
            >
              <Download size={15} />
              Export coverage
            </Button>
          </div>
          <div className="two-col-wide">
            <Panel
              title="Facility stock coverage"
              subtitle="Click a record for its calculation and delivery context."
            >
              <Table
                rows={filtered}
                label="Facility stock records"
                columns={[
                  {
                    key: 'facility_name',
                    label: 'Facility / medicine',
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>{r.facility_name}</strong>
                        <span>{r.product_name}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'usable_stock',
                    label: 'Usable stock',
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>
                          {number(r.usable_stock)} {r.unit}
                        </strong>
                        <span>{number(r.reserved_stock)} reserved</span>
                      </div>
                    ),
                  },
                  {
                    key: 'days_of_stock',
                    label: 'Coverage',
                    render: (r) =>
                      r.days_of_stock === null
                        ? 'Not estimable'
                        : r.days_of_stock.toFixed(1) + ' days',
                  },
                  {
                    key: 'expected_delivery',
                    label: 'Next delivery',
                    render: (r) => dateLabel(r.expected_delivery),
                  },
                  { key: 'risk', label: 'Risk', render: (r) => <Status value={r.risk} /> },
                  {
                    key: 'action',
                    label: '',
                    render: (r) =>
                      r.transfer_opportunity ? (
                        <button
                          className="text-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTransfer(r);
                          }}
                        >
                          Review transfer <ArrowUpRight size={13} />
                        </button>
                      ) : null,
                  },
                ]}
                onRowClick={setSelected}
              />
            </Panel>
            <div className="stack">
              <Panel
                title="Redistribution opportunities"
                subtitle="Proposed only. Never an automatic transfer."
              >
                <div className="transfer-list">
                  {(stock || [])
                    .filter((r) => r.transfer_opportunity)
                    .map((r) => (
                      <button key={r.id} onClick={() => setTransfer(r)}>
                        <span className="transfer-icon">
                          <Truck size={21} />
                        </span>
                        <div>
                          <strong>
                            {number(r.transfer_opportunity.quantity)} {r.unit}
                          </strong>
                          <p>
                            {r.transfer_opportunity.donor_name} <ArrowRight size={12} />{' '}
                            {r.facility_name}
                          </p>
                          <small>{r.product_name}</small>
                        </div>
                        <ArrowUpRight size={17} />
                      </button>
                    ))}
                  {stock && !stock.some((r) => r.transfer_opportunity) && (
                    <Empty
                      title="No feasible transfer identified"
                      description="Donor reserve, expiry, country, and product constraints must all pass."
                    />
                  )}
                </div>
              </Panel>
              <Panel title="Reading the signal">
                <div className="p-5 explanation-list">
                  <div>
                    <Package size={18} />
                    <p>
                      <strong>Usable, not just on hand.</strong> Reservations and expired quantities
                      are excluded.
                    </p>
                  </div>
                  <div>
                    <CircleAlert size={18} />
                    <p>
                      <strong>Lead time matters.</strong> Coverage shorter than expected
                      replenishment lead time is critical.
                    </p>
                  </div>
                  <div>
                    <ShieldCheck size={18} />
                    <p>
                      <strong>Local verification comes first.</strong> Confirm physical counts,
                      quality and route feasibility.
                    </p>
                  </div>
                </div>
                <Link to="/data" className="panel-bottom-link">
                  Inspect source data <ArrowRight size={14} />
                </Link>
              </Panel>
            </div>
          </div>
        </>
      )}
      {tab === 'Finance' && (
        <>
          <div className="section-toolbar">
            <Notice>
              Amounts are never combined across currencies. Commitments, payments and expenditure
              are separate events.
            </Notice>
            <label className="inline-label">
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {(finance?.by_currency || []).map((c: Row) => (
                  <option key={c.currency}>{c.currency}</option>
                ))}
              </select>
            </label>
          </div>
          {finance?.by_currency.length ? (
            <>
              <div className="finance-totals">
                {[
                  ['Allocated', 'allocations'],
                  ['Released', 'releases'],
                  ['Committed', 'commitments'],
                  ['Paid', 'payments'],
                  ['Recognised expenditure', 'expenditure'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <strong>
                      {money(
                        (finance.by_currency.find((c: Row) => c.currency === currency)?.[key] ||
                          0) / 100,
                        currency,
                      )}
                    </strong>
                    <small>{currency} · current source versions</small>
                  </div>
                ))}
              </div>
              <div className="two-col">
                <Panel
                  title="Allocation and recognised expenditure"
                  subtitle="Programme-level comparison in the selected currency; unreleased funds are not expenditure."
                >
                  <Table
                    rows={finance.programmes.filter((p: Row) => p.currency === currency)}
                    columns={[
                      { key: 'programme_name', label: 'Programme' },
                      {
                        key: 'amount_cents',
                        label: 'Allocation',
                        render: (r) => money(r.amount_cents / 100, currency),
                      },
                      {
                        key: 'released_cents',
                        label: 'Released',
                        render: (r) => money(r.released_cents / 100, currency),
                      },
                      {
                        key: 'expenditure_cents',
                        label: 'Expenditure',
                        render: (r) => money(r.expenditure_cents / 100, currency),
                      },
                    ]}
                  />
                </Panel>
                <Panel
                  title="Reconciliation gaps"
                  subtitle="Investigation questions, not findings of misconduct."
                >
                  <div className="p-5 stack">
                    <div className="reconciliation-stat">
                      <span>Overdue releases</span>
                      <strong>{finance.overdue_releases.length}</strong>
                    </div>
                    <div className="reconciliation-stat">
                      <span>Unmatched transactions</span>
                      <strong>{finance.unmatched.length}</strong>
                    </div>
                    {finance.unmatched.map((r: Row) => (
                      <div className="unmatched-card" key={r.id}>
                        <Badge tone="amber">Reference missing</Badge>
                        <strong>
                          {r.external_id} · {money(Number(r.amount_cents) / 100, r.currency)}
                        </strong>
                        <p>{r.description}</p>
                        <small>
                          Programme: {r.programme_code} · Reference: {r.reference}
                        </small>
                      </div>
                    ))}
                    <Button variant="secondary" onClick={() => setParams({ tab: 'Alerts' })}>
                      Review assigned alerts <ArrowRight size={14} />
                    </Button>
                  </div>
                </Panel>
              </div>
            </>
          ) : (
            <Empty
              title="No finance records in this project"
              description="Import budgets, releases, procurement and expenditure from Data Intelligence."
              action={
                <Link to="/data" className="btn btn-primary">
                  Import financial records
                </Link>
              }
            />
          )}
        </>
      )}
      {tab === 'Procurement' && (
        <Panel
          title="Procurement pipeline"
          subtitle="Stage age is evaluated against explicit expected durations and due dates."
        >
          <div className="pipeline">
            {['Tender evaluation', 'Contract review', 'Approval', 'Delivery'].map((stage, i) => {
              const items = (finance?.delayed_procurement || []).filter(
                (r: Row) => r.stage === stage,
              );
              return (
                <div key={stage}>
                  <div className="pipeline-head">
                    <span>0{i + 1}</span>
                    <h3>{stage}</h3>
                    <Badge tone={items.length ? 'amber' : 'neutral'}>{items.length} overdue</Badge>
                  </div>
                  {items.map((r: Row) => (
                    <button key={r.id} onClick={() => setSelected(r)}>
                      <strong>{r.title}</strong>
                      <span>{money(Number(r.amount_cents) / 100, r.currency)}</span>
                      <small>Due {dateLabel(r.due_date)}</small>
                      <Status value="Overdue" />
                    </button>
                  ))}
                  {!items.length && <p className="muted">No overdue records at this stage.</p>}
                </div>
              );
            })}
          </div>
          <div className="panel-foot">
            <GitPullRequest size={15} />A completed stage requires a recorded completion date.
            Missing approval references remain visible.
          </div>
        </Panel>
      )}
      {tab === 'Alerts' && (
        <Panel
          title="Operational alert queue"
          subtitle="Every signal includes its trigger, source record, owner, and next action."
          action={
            <Button variant="secondary" onClick={() => setDraft(true)} disabled={!allow('manage')}>
              <Plus size={15} />
              Draft response
            </Button>
          }
        >
          <Table
            rows={data?.operational_alerts || []}
            label="Operational alerts"
            columns={[
              {
                key: 'title',
                label: 'Alert / triggering condition',
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.title}</strong>
                    <span>{r.triggering_condition}</span>
                  </div>
                ),
              },
              { key: 'severity', label: 'Severity', render: (r) => <Status value={r.severity} /> },
              { key: 'category', label: 'Category' },
              {
                key: 'owner_id',
                label: 'Owner',
                render: (r) =>
                  data?.members.find((m) => m.user_id === r.owner_id)?.full_name || 'Unassigned',
              },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]}
            onRowClick={setAlert}
          />
        </Panel>
      )}
      {tab === 'Actions & milestones' && (
        <div className="two-col">
          <Panel
            title="Assigned actions"
            action={
              <Button
                variant="secondary"
                onClick={() => setTask(true)}
                disabled={!allow('operate')}
              >
                <Plus size={15} />
                Assign action
              </Button>
            }
          >
            <Table
              rows={data?.action_items || []}
              columns={[
                { key: 'title', label: 'Action' },
                { key: 'due_date', label: 'Due', render: (r) => dateLabel(r.due_date) },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              ]}
              onRowClick={(r) => allow('operate') && setSelected(r)}
            />
          </Panel>
          <Panel title="Implementation milestones">
            <Table
              rows={data?.milestones || []}
              columns={[
                { key: 'title', label: 'Milestone' },
                { key: 'due_date', label: 'Due date', render: (r) => dateLabel(r.due_date) },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              ]}
              onRowClick={(r) => allow('manage') && setSelected(r)}
            />
            <Notice>
              Overdue milestones are evaluated at the fixed snapshot date. No live timeline is
              implied.
            </Notice>
          </Panel>
        </div>
      )}
      {tab === 'Approvals' && (
        <Panel
          title="Human review queue"
          subtitle="Original proposal, supporting evidence, decision, override, and outcome remain linked."
          action={
            <Button variant="secondary" disabled={!allow('manage')} onClick={() => setDraft(true)}>
              <Plus size={15} />
              New recommendation
            </Button>
          }
        >
          <Table
            rows={data?.recommendations || []}
            label="Recommendations"
            columns={[
              {
                key: 'title',
                label: 'Recommendation',
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.title}</strong>
                    <span>{r.problem}</span>
                  </div>
                ),
              },
              {
                key: 'evidence_ids',
                label: 'Evidence',
                render: (r) => `${r.evidence_ids.length} references`,
              },
              { key: 'state', label: 'Status', render: (r) => <Status value={r.state} /> },
              { key: 'review_date', label: 'Last review', render: (r) => dateLabel(r.review_date) },
              {
                key: 'review',
                label: '',
                render: () => (
                  <span className="text-button">
                    Review <ArrowUpRight size={14} />
                  </span>
                ),
              },
            ]}
            onRowClick={setReview}
          />
        </Panel>
      )}
      {tab === 'Audit history' && (
        <Panel
          title="Project audit trail"
          subtitle="Append-only application audit records. Database administrator access remains a trusted operational boundary."
        >
          <Table
            rows={data?.audit_logs || []}
            label="Audit events"
            columns={[
              {
                key: 'created_at',
                label: 'Timestamp',
                render: (r) => new Date(r.created_at).toLocaleString(),
              },
              { key: 'action', label: 'Action' },
              { key: 'entity_type', label: 'Entity' },
              {
                key: 'actor_id',
                label: 'Actor',
                render: (r) =>
                  data?.members.find((m) => m.user_id === r.actor_id)?.full_name || r.actor_id,
              },
              { key: 'reason', label: 'Reason' },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {selected && ['Medicine supply', 'Procurement'].includes(tab) && (
        <Modal
          title={selected.facility_name || selected.title}
          onClose={() => setSelected(null)}
          wide
        >
          <KeyValue
            data={{
              Medicine: selected.product_name || '—',
              Snapshot: dateLabel(selected.reporting_date),
              'Usable stock': number(selected.usable_stock) + ' ' + (selected.unit || ''),
              'Daily consumption': selected.daily_consumption?.toFixed(2) || 'Unavailable',
              'Expected delivery': dateLabel(selected.expected_delivery),
            }}
          />
          <Notice tone={selected.risk === 'Critical' ? 'warning' : 'info'}>
            {selected.reason || selected.triggering_condition}
          </Notice>
          <h4>Source record</h4>
          <JsonView value={selected} />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected.transfer_opportunity && (
              <Button
                onClick={() => {
                  setTransfer(selected);
                  setSelected(null);
                }}
              >
                Inspect transfer proposal <ArrowRight size={15} />
              </Button>
            )}
          </div>
        </Modal>
      )}
      {selected && tab === 'Audit history' && (
        <Modal title="Audit event" onClose={() => setSelected(null)} wide>
          <JsonView value={selected} />
        </Modal>
      )}
      {selected && tab === 'Actions & milestones' && (
        <RecordForm
          title="Update assigned record"
          table={
            data?.action_items.some((r) => r.id === selected.id) ? 'action_items' : 'milestones'
          }
          initial={selected}
          fields={[
            { name: 'title', label: 'Title', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: ['Open', 'In progress', 'Completed', 'Escalated'],
            },
            { name: 'due_date', label: 'Due date', type: 'date', required: true },
          ]}
          onClose={() => setSelected(null)}
        />
      )}
      {transfer && (
        <Modal title="Proposed medicine redistribution" wide onClose={() => setTransfer(null)}>
          <Notice tone="warning">
            This is a planning proposal. No stock movement has been initiated or approved.
          </Notice>
          <div className="transfer-route">
            <div>
              <span>DONOR</span>
              <h3>{transfer.transfer_opportunity.donor_name}</h3>
              <strong>{transfer.transfer_opportunity.donor_days_after.toFixed(1)} days</strong>
              <small>coverage after proposed transfer</small>
            </div>
            <div>
              <Truck size={28} />
              <strong>
                {number(transfer.transfer_opportunity.quantity)} {transfer.unit}
              </strong>
              <small>Assumed transit: 2 days</small>
            </div>
            <div>
              <span>RECIPIENT</span>
              <h3>{transfer.facility_name}</h3>
              <strong>{transfer.transfer_opportunity.recipient_days_after.toFixed(1)} days</strong>
              <small>coverage after proposed transfer</small>
            </div>
          </div>
          <h4>Constraints checked</h4>
          <ul className="detail-list">
            {transfer.transfer_opportunity.constraints.map((x: string) => (
              <li key={x}>
                <CheckCircle2 size={14} />
                {x}
              </li>
            ))}
          </ul>
          <p className="muted">
            Source inventory IDs: {transfer.transfer_opportunity.source_records.join(', ')}
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setTransfer(null)}>
              Close
            </Button>
            <Button
              disabled={!allow('manage')}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                const e = (
                  await api<{ rows: Row[]; evidence_id: string }>(
                    '/projects/' + project!.id + '/stock',
                  )
                ).evidence_id;
                const ok = await action(
                  () =>
                    api('/projects/' + project!.id + '/recommendations', {
                      body: {
                        title: `Review transfer to ${transfer.facility_name}`,
                        problem: transfer.reason,
                        action: JSON.stringify(transfer.transfer_opportunity),
                        benefit: `Recipient coverage increases to an estimated ${transfer.transfer_opportunity.recipient_days_after.toFixed(1)} days, subject to verification.`,
                        evidence_id: e,
                      },
                    }),
                  'Proposal submitted for independent review',
                );
                setBusy(false);
                if (ok) {
                  setTransfer(null);
                  setParams({ tab: 'Approvals' });
                }
              }}
            >
              Submit for review <ShieldCheck size={16} />
            </Button>
          </div>
        </Modal>
      )}
      {alert && (
        <AlertDetail
          record={alert}
          onClose={() => setAlert(null)}
          onEvidence={(id) => setEvidence(id)}
        />
      )}{' '}
      {task && (
        <RecordForm
          title="Assign an operational action"
          table="action_items"
          fields={[
            { name: 'title', label: 'Action', required: true },
            { name: 'description', label: 'Context', type: 'textarea' },
            { name: 'due_date', label: 'Due date', type: 'date', required: true },
            {
              name: 'priority',
              label: 'Priority',
              type: 'select',
              options: ['Low', 'Medium', 'High'],
            },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: ['Open', 'In progress', 'Completed'],
            },
          ]}
          onClose={() => setTask(false)}
        />
      )}{' '}
      {review && <RecommendationDetail record={review} onClose={() => setReview(null)} />}{' '}
      {draft && <CreateRecommendation onClose={() => setDraft(false)} />}{' '}
      {evidence && <EvidenceDetail id={evidence} onClose={() => setEvidence(null)} />}
    </>
  );
}
function AlertDetail({
  record,
  onClose,
  onEvidence,
}: {
  record: Row;
  onClose: () => void;
  onEvidence: (id: string) => void;
}) {
  const { allow, data } = useStore(),
    action = useAction();
  const [status, setStatus] = useState(record.status),
    [note, setNote] = useState(''),
    [owner, setOwner] = useState(record.owner_id || ''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={record.title} onClose={onClose}>
      <Status value={record.severity} />
      <KeyValue
        data={{
          Trigger: record.triggering_condition,
          'Recommended next action': record.recommended_action,
          Detected: dateLabel(record.created_at),
        }}
      />
      <button className="text-button" onClick={() => onEvidence(record.evidence_id)}>
        Inspect supporting evidence <ArrowUpRight size={14} />
      </button>
      <details>
        <summary>Source record identifiers</summary>
        <JsonView value={record.source_records} />
      </details>
      {allow('operate') ? (
        <form
          className="form-stack mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await action(
              () =>
                api('/records/operational_alerts/' + record.id, {
                  method: 'PATCH',
                  body: { status, owner_id: owner || null, resolved_note: note || null },
                }),
              'Alert status updated and audited',
            );
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <label className="form-field">
            <span>Assign owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {data?.members.map((m) => (
                <option value={m.user_id} key={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {['Open', 'Acknowledged', 'Investigating', 'Resolved', 'Escalated'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Investigation / resolution note {status === 'Resolved' ? '*' : ''}</span>
            <textarea
              required={status === 'Resolved'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>
          <Button busy={busy}>
            Save alert update <ShieldCheck size={16} />
          </Button>
        </form>
      ) : (
        <Notice>Your role has read-only access to this alert.</Notice>
      )}
    </Modal>
  );
}
