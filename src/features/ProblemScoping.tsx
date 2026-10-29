import { useState } from 'react';
import { Plus, ArrowRight, ArrowLeft, Download, Users, Pencil } from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, download } from '../lib/api';
import {
  PageHeader,
  Panel,
  Tabs,
  Table,
  Button,
  Status,
  Notice,
  Modal,
  KeyValue,
  Empty,
} from '../components/ui';
import { RecordForm } from '../components/workflow';
const stages = [
  {
    title: 'Define the problem',
    description: 'Be specific about who is affected, where, and what is not working.',
    fields: [
      ['title', 'Project / brief title'],
      ['problem', 'Problem statement'],
      ['countries', 'Country or countries'],
      ['region', 'Region / district / facility'],
      ['population', 'Affected population'],
      ['current_workflow', 'Current workflow'],
      ['existing_intervention', 'Existing intervention'],
      ['pain_points', 'Current pain points'],
      ['urgency', 'Urgency'],
      ['users', 'Expected users'],
      ['sponsor', 'Project sponsor'],
      ['owner', 'Project owner'],
    ],
  },
  {
    title: 'Understand the causes',
    description: 'Separate symptoms from causes and record competing explanations.',
    fields: [
      ['root_causes', 'Five Whys / cause chain'],
      ['workflow', 'Workflow steps and handoffs'],
      ['bottlenecks', 'Bottlenecks'],
      ['stakeholders', 'Stakeholders, influence and interests'],
      ['constraints', 'Known constraints'],
      ['competing_explanations', 'Competing explanations'],
      ['process_documentation', 'Existing process documentation'],
    ],
  },
  {
    title: 'Inventory the evidence',
    description: 'Record availability and lawful use before proposing a solution.',
    fields: [
      ['datasets', 'Available datasets and source systems'],
      ['data_owners', 'Data owners'],
      ['collection_frequency', 'Collection frequency'],
      ['coverage', 'Geographic and time coverage'],
      ['formats', 'Formats and approximate volume'],
      ['missingness', 'Missingness and quality limitations'],
      ['access', 'Access and sharing restrictions'],
      ['lawful_use', 'Consent, lawful basis, and minimisation'],
    ],
  },
  {
    title: 'Choose the simplest useful method',
    description:
      'AI is optional. Conventional software or process change may be the better answer.',
    fields: [
      ['assessment', 'Solution assessment'],
      ['alternatives', 'Conventional / rules / analytics alternatives'],
      ['ai_rationale', 'Why AI is or is not justified'],
      ['method', 'Proposed method or combination'],
      ['no_ai', 'When no AI intervention is appropriate'],
    ],
  },
  {
    title: 'Plan evaluation and delivery',
    description: 'Define success before implementation and make assumptions explicit.',
    fields: [
      ['baseline', 'Baseline performance'],
      ['outcome', 'Intended outcome'],
      ['kpis', 'Key performance indicators'],
      ['evaluation', 'Evaluation method'],
      ['required_data', 'Required data'],
      ['dependencies', 'Technical and operational dependencies'],
      ['risks', 'Risks and mitigations'],
      ['milestones', 'Delivery milestones'],
      ['resources', 'Estimated resource requirements'],
      ['acceptance', 'Acceptance criteria'],
      ['missing_information', 'Missing information requiring confirmation'],
      ['assumptions', 'Assumptions requiring confirmation'],
    ],
  },
];
export function ProblemScoping() {
  const { data, allow } = useStore();
  const [tab, setTab] = useState('Problem briefs'),
    [wizard, setWizard] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [edit, setEdit] = useState<Row | null>(null),
    [record, setRecord] = useState<Row | null | undefined>(undefined);
  return (
    <>
      <PageHeader
        eyebrow="PROBLEM SCOPING STUDIO"
        title="Start with the right problem."
        description="Turn a broad development challenge into a testable, evidence-based project brief."
      >
        <Button disabled={!allow('manage')} onClick={() => setWizard(true)}>
          <Plus size={16} />
          New problem brief
        </Button>
      </PageHeader>
      <Tabs
        items={['Problem briefs', 'Stakeholder map', 'Requirements', 'Risks & milestones']}
        value={tab}
        onChange={setTab}
      />
      {tab === 'Problem briefs' && (
        <>
          <div className="scoping-stages">
            {stages.map((s, i) => (
              <div key={s.title}>
                <span>0{i + 1}</span>
                <strong>{s.title}</strong>
                {i < 4 && <ArrowRight size={15} />}
              </div>
            ))}
          </div>
          <Panel
            title="Project problem briefs"
            subtitle="Structured, editable documents with assumptions and missing information clearly identified."
          >
            <Table
              rows={data?.problem_briefs || []}
              columns={[
                { key: 'title', label: 'Brief' },
                { key: 'version', label: 'Version' },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
                { key: 'content', label: 'Owner', render: (r) => r.content.owner || 'Unassigned' },
                {
                  key: 'action',
                  label: '',
                  render: () => (
                    <span className="text-button">
                      Open brief <ArrowRight size={14} />
                    </span>
                  ),
                },
              ]}
              onRowClick={setSelected}
            />
          </Panel>
          <Notice>
            Generated templates are drafts, not verified claims. This local workflow does not call
            an LLM or invent missing evidence.
          </Notice>
        </>
      )}
      {tab === 'Stakeholder map' && (
        <Panel
          title="Stakeholders and accountability"
          action={
            <Button variant="secondary" disabled={!allow('manage')} onClick={() => setRecord(null)}>
              <Plus size={15} />
              Add stakeholder
            </Button>
          }
        >
          <div className="stakeholder-grid">
            {data?.stakeholders.map((s) => (
              <button key={s.id} onClick={() => setRecord(s)}>
                <span className="avatar">
                  <Users size={21} />
                </span>
                <h3>{s.name}</h3>
                <Status value={s.role} />
                <KeyValue data={{ Influence: s.influence, Interest: s.interest }} />
                <p>{s.notes}</p>
              </button>
            ))}
          </div>
          {!data?.stakeholders.length && (
            <Empty
              title="Map the people behind the process"
              description="Include data owners, operators, affected communities, and decision-makers."
            />
          )}
        </Panel>
      )}
      {tab === 'Requirements' && (
        <Panel title="Requirements and delivery documents">
          <Table
            rows={data?.requirements_documents || []}
            columns={[
              { key: 'title', label: 'Document' },
              { key: 'version', label: 'Version' },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {tab === 'Risks & milestones' && (
        <div className="two-col">
          <Panel title="Project risk register">
            <Table
              rows={data?.risk_assessments || []}
              columns={[
                { key: 'title', label: 'Risk' },
                {
                  key: 'severity',
                  label: 'Severity',
                  render: (r) => <Status value={r.severity} />,
                },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              ]}
              onRowClick={setSelected}
            />
          </Panel>
          <Panel title="Delivery roadmap">
            <Table
              rows={data?.milestones || []}
              columns={[
                { key: 'title', label: 'Milestone' },
                { key: 'due_date', label: 'Due date' },
                { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
              ]}
              onRowClick={setSelected}
            />
          </Panel>
        </div>
      )}
      {wizard && <BriefWizard onClose={() => setWizard(false)} />}{' '}
      {selected && (
        <Modal title={selected.title} wide onClose={() => setSelected(null)}>
          <div className="detail-top">
            <Status value={selected.status} />
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  'project-document-' + selected.id + '.md',
                  '# ' +
                    selected.title +
                    '\n\nSYNTHETIC / DRAFT CONTENT — verify all assumptions.\n\n' +
                    Object.entries(selected.content)
                      .map(
                        ([k, v]) =>
                          '## ' +
                          k.replaceAll('_', ' ') +
                          '\n' +
                          (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)),
                      )
                      .join('\n\n'),
                  'text/markdown',
                )
              }
            >
              <Download size={15} />
              Export brief
            </Button>
          </div>
          <div className="document-content">
            {Object.entries(selected.content).map(([key, value]) => (
              <section key={key}>
                <h3>{key.replaceAll('_', ' ')}</h3>
                <p>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
              </section>
            ))}
          </div>
          <Notice tone="warning">
            Missing information and assumptions require confirmation. Document approval is not
            approval to execute a high-impact operational action.
          </Notice>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={!allow('manage')}
              onClick={() => {
                setEdit(selected);
                setSelected(null);
              }}
            >
              <Pencil size={15} />
              Edit as new version
            </Button>
            <Button
              variant="secondary"
              disabled={!allow('manage') || selected.status === 'Approved'}
              onClick={async () => {
                await api(
                  '/records/' +
                    (data?.problem_briefs.some((b) => b.id === selected.id)
                      ? 'problem_briefs'
                      : 'requirements_documents') +
                    '/' +
                    selected.id,
                  { method: 'PATCH', body: { status: 'Approved' } },
                );
                window.location.reload();
              }}
            >
              Mark document reviewed
            </Button>
          </div>
        </Modal>
      )}
      {record !== undefined && (
        <RecordForm
          title="Stakeholder mapping"
          table="stakeholders"
          initial={record || undefined}
          fields={[
            { name: 'name', label: 'Name / role', required: true },
            { name: 'role', label: 'Accountability', required: true },
            {
              name: 'influence',
              label: 'Influence',
              type: 'select',
              options: ['High', 'Medium', 'Low'],
            },
            {
              name: 'interest',
              label: 'Interest',
              type: 'select',
              options: ['High', 'Medium', 'Low'],
            },
            { name: 'notes', label: 'Engagement notes', type: 'textarea' },
          ]}
          onClose={() => setRecord(undefined)}
        />
      )}{' '}
      {edit && <EditBrief record={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function BriefWizard({ onClose }: { onClose: () => void }) {
  const { data } = useStore(),
    action = useAction();
  const [stage, setStage] = useState(0),
    [content, setContent] = useState<Record<string, string>>({
      urgency: 'High',
      assessment: 'Conventional analytics and statistical forecasting',
      lawful_use: 'Synthetic demonstration only; real data requires lawful-use review.',
    }),
    [busy, setBusy] = useState(false);
  const current = stages[stage];
  return (
    <Modal title="Guided problem intake" wide onClose={onClose}>
      <div className="wizard-progress">
        {stages.map((s, i) => (
          <div key={s.title} className={stage >= i ? 'active' : ''}>
            <span>{i + 1}</span>
            {['Problem', 'Causes', 'Evidence', 'Method', 'Delivery'][i]}
          </div>
        ))}
      </div>
      <h3 className="detail-title">{current.title}</h3>
      <p className="muted mb-5">{current.description}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (stage < 4) {
            setStage(stage + 1);
            return;
          }
          setBusy(true);
          const ok = await action(
            () =>
              api('/projects/' + data!.project.id + '/records/problem_briefs', {
                body: {
                  title: content.title,
                  status: 'Draft',
                  version: 1,
                  content: {
                    ...content,
                    generated_by: 'Deterministic local intake template',
                    verification: 'Unverified claims require confirmation',
                  },
                },
              }),
            'Problem brief saved as a draft',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <div className="two-col">
          {current.fields.map(([key, label]) => (
            <label
              className={`form-field ${key.includes('statement') || key.includes('workflow') || key.includes('assessment') ? 'span-two' : ''}`}
              key={key}
            >
              <span>
                {label}
                {['title', 'problem', 'countries'].includes(key) ? ' *' : ''}
              </span>
              <textarea
                rows={key === 'title' ? 1 : 2}
                required={['title', 'problem', 'countries'].includes(key)}
                value={content[key] || ''}
                placeholder={
                  key === 'missing_information'
                    ? 'List evidence or permissions still needed…'
                    : 'Enter known information; do not invent missing facts…'
                }
                onChange={(e) => setContent({ ...content, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {stage === 4 && (
          <Notice>
            This creates a structured brief. Requirements, a risk register, and a roadmap can be
            managed in their respective tabs. Assumptions remain marked for confirmation.
          </Notice>
        )}
        <div className="modal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => (stage ? setStage(stage - 1) : onClose())}
          >
            {stage ? <ArrowLeft size={15} /> : null}
            {stage ? 'Back' : 'Cancel'}
          </Button>
          <Button busy={busy}>
            {stage === 4 ? 'Save problem brief' : 'Continue'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function EditBrief({ record, onClose }: { record: Row; onClose: () => void }) {
  const action = useAction();
  const [content, setContent] = useState(JSON.stringify(record.content, null, 2)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Create a new brief version" wide onClose={onClose}>
      <Notice>
        The previous version remains in the database. This creates version {record.version + 1}{' '}
        linked to its predecessor.
      </Notice>
      <label className="form-field">
        <span>Structured document content (JSON)</span>
        <textarea rows={20} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <Button
        busy={busy}
        onClick={async () => {
          try {
            const parsed = JSON.parse(content);
            setBusy(true);
            const ok = await action(
              () =>
                api('/projects/' + record.project_id + '/records/problem_briefs', {
                  body: {
                    title: record.title,
                    status: 'Draft',
                    version: record.version + 1,
                    parent_id: record.id,
                    content: parsed,
                  },
                }),
              'New draft version saved',
            );
            setBusy(false);
            if (ok) onClose();
          } catch {
            setError('Enter valid JSON before saving.');
          }
        }}
      >
        Save new version
      </Button>
    </Modal>
  );
}
