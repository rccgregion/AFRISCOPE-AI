import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Plus,
  Download,
  ArrowUpRight,
  AlertTriangle,
  LockKeyhole,
  Eye,
  Scale,
  FileCheck2,
} from 'lucide-react';
import { useStore, type Row } from '../lib/store';
import { exportCSV } from '../lib/api';
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
  JsonView,
  Empty,
} from '../components/ui';
import { RecordForm, EvidenceDetail } from '../components/workflow';
import { dateLabel } from '../../shared/domain';
const policies = [
  {
    title: 'Human authority is non-negotiable',
    icon: ShieldCheck,
    body: 'Funding allocations, procurement, medicine redistribution and programme prioritisation require authorised human review. The application records decisions but never executes these transactions.',
  },
  {
    title: 'Collect less. Protect more.',
    icon: LockKeyhole,
    body: 'Use synthetic data for demonstration. Real deployments require a lawful basis, data minimisation, access review, retention limits, and data-sharing agreements. Sensitive records are excluded from external AI by default.',
  },
  {
    title: 'Arithmetic belongs in code',
    icon: Scale,
    body: 'Financial totals use integer minor units and explicit currencies. Stock calculations, constraints, forecasts and evaluation metrics are deterministic or statistical application services, never language-model arithmetic.',
  },
  {
    title: 'Show the evidence and its limits',
    icon: Eye,
    body: 'Recommendations expose source versions, methods, assumptions and limitations. Model predictions are distinct from verified facts and user-entered assumptions. No citation or confidence value is invented.',
  },
  {
    title: 'Fairness requires context',
    icon: FileCheck2,
    body: 'Where subgroup data exists, evaluation reports sample size and performance. Small samples and missing subgroup information prevent claims of fairness or absence of bias.',
  },
];
export function Governance() {
  const { data, allow } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'Governance overview';
  const [form, setForm] = useState<{ table: string; record?: Row } | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [evidence, setEvidence] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        eyebrow="RESPONSIBLE AI & GOVERNANCE"
        title="Accountability, by design."
        description="A clear record of what the system can do, what it cannot prove, and who remains responsible."
      >
        <Button variant="secondary" onClick={() => setForm({ table: 'ai_incidents' })}>
          <AlertTriangle size={16} />
          Report incident
        </Button>
        <Button
          variant="secondary"
          onClick={() => exportCSV('governance-audit.csv', data?.audit_logs || [])}
        >
          <Download size={16} />
          Export audit
        </Button>
      </PageHeader>
      <Tabs
        items={[
          'Governance overview',
          'AI & model registry',
          'Risk assessments',
          'Incidents',
          'Evaluation evidence',
          'Audit history',
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t })}
      />
      {tab === 'Governance overview' && (
        <>
          <div className="governance-banner">
            <ShieldCheck size={35} />
            <div>
              <h2>Decision support. Never decision replacement.</h2>
              <p>
                This environment uses synthetic records, deterministic local explanations, and
                explicit human review. External model quality and real-world impact are not
                certified.
              </p>
            </div>
            <Badge tone="green">Human oversight enabled</Badge>
          </div>
          <div className="policy-grid">
            {policies.map((p) => (
              <section key={p.title}>
                <p.icon size={24} />
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </section>
            ))}
          </div>
          <div className="two-col">
            <Panel title="Review responsibilities">
              <KeyValue
                data={{
                  'Programme manager': 'Validates assumptions and submits proposals.',
                  'Independent reviewer': 'Approves, rejects or defers with a recorded reason.',
                  'Data analyst': 'Maintains source quality and reproducible evaluation.',
                  'Organisation administrator': 'Manages membership, access, and retention policy.',
                  Operator: 'Verifies local conditions and records implementation outcomes.',
                }}
              />
            </Panel>
            <Panel title="Current limitations">
              <div className="p-5">
                <Notice tone="warning">
                  Before handling real data, complete a privacy impact assessment, threat model,
                  legal review, external penetration test, retention configuration, and operational
                  model validation.
                </Notice>
                <ul className="detail-list mt-4">
                  <li>No formal accreditation or regulatory certification.</li>
                  <li>No real-world cost-effectiveness evidence.</li>
                  <li>External LLM integration is optional and not evaluated here.</li>
                  <li>Database administrators are trusted infrastructure operators.</li>
                </ul>
                <a className="text-button" href="/guide">
                  Read the platform guide <ArrowUpRight size={14} />
                </a>
              </div>
            </Panel>
          </div>
        </>
      )}
      {tab === 'AI & model registry' && (
        <div className="stack">
          <Panel
            title="AI-enabled system inventory"
            action={
              <Button
                variant="secondary"
                disabled={!allow('data')}
                onClick={() => setForm({ table: 'models' })}
              >
                <Plus size={15} />
                Register system
              </Button>
            }
          >
            <Table
              rows={data?.models || []}
              columns={[
                { key: 'name', label: 'System' },
                { key: 'purpose', label: 'Purpose' },
                {
                  key: 'risk_classification',
                  label: 'Risk',
                  render: (r) => <Badge tone="amber">Human review</Badge>,
                },
                { key: 'owner', label: 'Owner' },
                {
                  key: 'review_date',
                  label: 'Review date',
                  render: (r) => dateLabel(r.review_date),
                },
              ]}
              onRowClick={setSelected}
            />
          </Panel>
          <Panel
            title="Model / method versions"
            action={
              <Button
                variant="secondary"
                disabled={!allow('data')}
                onClick={() => setForm({ table: 'model_versions' })}
              >
                <Plus size={15} />
                Register version
              </Button>
            }
          >
            <Table
              rows={data?.model_versions || []}
              columns={[
                { key: 'version', label: 'Version' },
                { key: 'method', label: 'Method' },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                {
                  key: 'evaluation',
                  label: 'Evaluation',
                  render: (r) =>
                    Object.keys(r.evaluation || {}).length ? 'Recorded' : 'Not yet recorded',
                },
              ]}
              onRowClick={setSelected}
            />
            {!data?.model_versions.length && (
              <Empty
                title="No additional model versions registered"
                description="Executed baseline methods are versioned in analytical runs and the experiment log."
              />
            )}
          </Panel>
          <Panel title="Dataset registry">
            <Table
              rows={data?.datasets || []}
              columns={[
                { key: 'name', label: 'Dataset' },
                { key: 'sensitivity', label: 'Classification' },
                { key: 'owner', label: 'Owner' },
                {
                  key: 'quality_status',
                  label: 'Quality',
                  render: (r) => <Status value={r.quality_status} />,
                },
              ]}
            />
          </Panel>
        </div>
      )}
      {tab === 'Risk assessments' && (
        <Panel
          title="Risk, privacy and fairness reviews"
          action={
            <Button
              variant="secondary"
              disabled={!allow('manage')}
              onClick={() => setForm({ table: 'risk_assessments' })}
            >
              <Plus size={15} />
              New assessment
            </Button>
          }
        >
          <Table
            rows={data?.risk_assessments || []}
            columns={[
              { key: 'title', label: 'Assessment' },
              { key: 'category', label: 'Category' },
              { key: 'severity', label: 'Severity', render: (r) => <Status value={r.severity} /> },
              { key: 'owner', label: 'Owner' },
              { key: 'review_date', label: 'Review date', render: (r) => dateLabel(r.review_date) },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {tab === 'Incidents' && (
        <Panel
          title="Incident register"
          subtitle="Report incorrect outputs, suspected bias, missing evidence, privacy or security concerns. Do not include personal data in the description."
          action={
            <Button variant="secondary" onClick={() => setForm({ table: 'ai_incidents' })}>
              <Plus size={15} />
              Report incident
            </Button>
          }
        >
          <Table
            rows={data?.ai_incidents || []}
            columns={[
              { key: 'title', label: 'Incident' },
              { key: 'category', label: 'Category' },
              { key: 'severity', label: 'Severity', render: (r) => <Status value={r.severity} /> },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              {
                key: 'remediation',
                label: 'Remediation',
                render: (r) => r.remediation || 'Not yet defined',
              },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {tab === 'Evaluation evidence' && (
        <Panel
          title="Validated evidence registry"
          subtitle="Only computed, version-linked records are used by the local assistant."
          action={
            <Button
              variant="secondary"
              onClick={() => exportCSV('evidence-registry.csv', data?.evidence_records || [])}
            >
              <Download size={15} />
              Export registry
            </Button>
          }
        >
          <Table
            rows={data?.evidence_records || []}
            columns={[
              { key: 'question', label: 'Question' },
              { key: 'method', label: 'Method' },
              { key: 'method_version', label: 'Version' },
              {
                key: 'classification',
                label: 'Classification',
                render: (r: Row) => <Badge tone="blue">{r.classification}</Badge>,
              },
              { key: 'reporting_period', label: 'Period' },
            ]}
            onRowClick={(r) => setEvidence(r.id)}
          />
        </Panel>
      )}
      {tab === 'Audit history' && (
        <Panel
          title="Append-only project audit history"
          subtitle="Application events record actor, action, before / after state, reason, and timestamp."
        >
          <Table
            rows={data?.audit_logs || []}
            columns={[
              {
                key: 'created_at',
                label: 'Timestamp',
                render: (r) => new Date(r.created_at).toLocaleString(),
              },
              { key: 'action', label: 'Action' },
              { key: 'entity_type', label: 'Entity' },
              { key: 'reason', label: 'Reason' },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {form && (
        <RecordForm
          title={
            form.table === 'ai_incidents'
              ? 'Report an incident'
              : form.table === 'models'
                ? 'Register an AI-enabled system'
                : form.table === 'model_versions'
                  ? 'Register model version'
                  : 'Create responsible AI assessment'
          }
          table={form.table}
          initial={form.record}
          fields={
            form.table === 'ai_incidents'
              ? [
                  { name: 'title', label: 'Incident title', required: true },
                  {
                    name: 'category',
                    label: 'Category',
                    type: 'select',
                    options: [
                      'Incorrect recommendation',
                      'Data leakage',
                      'Unexpected model behaviour',
                      'Suspected bias',
                      'Security incident',
                      'Missing evidence',
                      'Unsafe output',
                    ],
                  },
                  {
                    name: 'severity',
                    label: 'Severity',
                    type: 'select',
                    options: ['Low', 'Medium', 'High', 'Critical'],
                  },
                  {
                    name: 'description',
                    label: 'Description (no personal data)',
                    type: 'textarea',
                    required: true,
                  },
                  {
                    name: 'status',
                    label: 'Status',
                    type: 'select',
                    options: ['Open', 'Investigating', 'Remediated', 'Closed'],
                  },
                  { name: 'remediation', label: 'Remediation', type: 'textarea' },
                  { name: 'closure', label: 'Closure notes', type: 'textarea' },
                ]
              : form.table === 'models'
                ? [
                    { name: 'name', label: 'System name', required: true },
                    { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
                    { name: 'intended_users', label: 'Intended users', required: true },
                    { name: 'intended_use', label: 'Intended use', type: 'textarea' },
                    { name: 'prohibited_use', label: 'Prohibited use', type: 'textarea' },
                    { name: 'inputs', label: 'Data inputs' },
                    { name: 'limitations', label: 'Known limitations', type: 'textarea' },
                    { name: 'owner', label: 'Responsible owner', required: true },
                    { name: 'risk_classification', label: 'Risk classification', required: true },
                    { name: 'review_date', label: 'Review date', type: 'date' },
                  ]
                : form.table === 'model_versions'
                  ? [
                      { name: 'model_id', label: 'System ID (from registry)', required: true },
                      { name: 'version', label: 'Version', required: true },
                      { name: 'method', label: 'Method', required: true },
                      {
                        name: 'status',
                        label: 'Status',
                        type: 'select',
                        options: ['Candidate', 'Evaluated', 'Approved for review', 'Retired'],
                      },
                      { name: 'configuration', label: 'Configuration (JSON)', type: 'json' },
                      {
                        name: 'evaluation',
                        label: 'Measured evaluation only (JSON)',
                        type: 'json',
                      },
                    ]
                  : [
                      { name: 'title', label: 'Assessment title', required: true },
                      {
                        name: 'category',
                        label: 'Category',
                        type: 'select',
                        options: [
                          'Privacy',
                          'Fairness',
                          'Human oversight',
                          'Model limitation',
                          'Security',
                        ],
                      },
                      {
                        name: 'severity',
                        label: 'Severity',
                        type: 'select',
                        options: ['Low', 'Medium', 'High', 'Critical'],
                      },
                      {
                        name: 'likelihood',
                        label: 'Likelihood',
                        type: 'select',
                        options: ['Rare', 'Possible', 'Likely'],
                      },
                      { name: 'mitigation', label: 'Mitigation', type: 'textarea', required: true },
                      { name: 'owner', label: 'Responsible owner', required: true },
                      {
                        name: 'status',
                        label: 'Status',
                        type: 'select',
                        options: ['Open', 'In review', 'Mitigated', 'Accepted with conditions'],
                      },
                      { name: 'review_date', label: 'Review date', type: 'date' },
                      { name: 'content', label: 'Supporting assessment (JSON)', type: 'json' },
                    ]
          }
          onClose={() => setForm(null)}
        />
      )}
      {selected && (
        <Modal
          title={selected.title || selected.name || selected.version || 'Governance record'}
          wide
          onClose={() => setSelected(null)}
        >
          <JsonView value={selected} />
          {allow(selected.owner_id ? 'operate' : 'manage') && (
            <Button
              variant="secondary"
              onClick={() => {
                setForm({
                  table:
                    selected.title && selected.description
                      ? 'ai_incidents'
                      : selected.name
                        ? 'models'
                        : selected.version
                          ? 'model_versions'
                          : 'risk_assessments',
                  record: selected,
                });
                setSelected(null);
              }}
            >
              Edit record
            </Button>
          )}
        </Modal>
      )}
      {evidence && <EvidenceDetail id={evidence} onClose={() => setEvidence(null)} />}
    </>
  );
}
