import { useState } from 'react';
import { ArrowRight, ShieldCheck, FileText, CheckCircle2, Send, History } from 'lucide-react';
import { api, download } from '../lib/api';
import { useStore, useAction, type Row } from '../lib/store';
import { Button, Modal, KeyValue, Status, Notice, JsonView, Empty, Badge } from './ui';
import { dateLabel, TRANSITIONS, type RecommendationState } from '../../shared/domain';
export function RecordForm({
  title,
  table,
  fields,
  onClose,
  initial,
}: {
  title: string;
  table: string;
  fields: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    options?: string[];
    hint?: string;
  }[];
  onClose: () => void;
  initial?: Row;
}) {
  const { project } = useStore(),
    action = useAction();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const body: Record<string, unknown> = {};
          for (const f of fields) {
            const value = form.get(f.name);
            body[f.name] =
              f.type === 'number'
                ? Number(value)
                : f.type === 'json'
                  ? JSON.parse(String(value || '{}'))
                  : f.type === 'checkbox'
                    ? value === 'on'
                    : value || null;
          }
          setBusy(true);
          const ok = await action(
            () =>
              initial
                ? api('/records/' + table + '/' + initial.id, { method: 'PATCH', body })
                : api('/projects/' + project!.id + '/records/' + table, { body }),
            initial ? 'Record updated' : 'Record created',
          );
          setBusy(false);
          if (ok) onClose();
        }}
        className="form-stack"
      >
        {fields.map((f) => (
          <label className="form-field" key={f.name}>
            <span>
              {f.label}
              {f.required && <b> *</b>}
            </span>
            {f.type === 'textarea' || f.type === 'json' ? (
              <textarea
                name={f.name}
                rows={f.type === 'json' ? 5 : 3}
                required={f.required}
                defaultValue={
                  f.type === 'json'
                    ? JSON.stringify(initial?.[f.name] || {}, null, 2)
                    : initial?.[f.name] || ''
                }
              />
            ) : f.type === 'select' ? (
              <select
                name={f.name}
                required={f.required}
                defaultValue={initial?.[f.name] || f.options?.[0]}
              >
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <input name={f.name} type="checkbox" defaultChecked={initial?.[f.name] ?? true} />
            ) : (
              <input
                name={f.name}
                type={f.type || 'text'}
                required={f.required}
                min={f.type === 'number' ? '0' : undefined}
                step={f.type === 'number' ? '1' : undefined}
                defaultValue={initial?.[f.name] ?? ''}
              />
            )}{' '}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        <Notice>Changes are saved to this project and recorded in the audit history.</Notice>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {initial ? 'Save changes' : 'Create record'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function EvidenceDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useStore();
  const e = data?.evidence_records.find((e) => e.id === id);
  return (
    <Modal title="Evidence record" wide onClose={onClose}>
      {e ? (
        <>
          <div className="eyebrow">VALIDATED {String(e.classification).toUpperCase()}</div>
          <h3 className="detail-title">{e.question}</h3>
          <KeyValue
            data={{
              'Evidence ID': e.id,
              Method: e.method + ' · ' + e.method_version,
              'Reporting period': e.reporting_period,
              'Snapshot date': dateLabel(e.freshness),
              Created: dateLabel(e.created_at),
            }}
          />
          <h4>Source dataset versions</h4>
          <JsonView value={e.source_versions} />
          <h4>Computed result</h4>
          <JsonView value={e.result} />
          <div className="two-col mt-5">
            <div>
              <h4>Assumptions</h4>
              <ul className="detail-list">
                {(e.assumptions as string[]).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Limitations</h4>
              <ul className="detail-list">
                {(e.limitations as string[]).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
          <Notice tone="warning">
            This evidence supports review. It is not an authorisation to transfer stock, release
            funds, or implement a policy.
          </Notice>
        </>
      ) : (
        <Empty
          title="Evidence unavailable"
          description="The record may be outside this project or your access scope."
        />
      )}
    </Modal>
  );
}
export function RecommendationDetail({ record, onClose }: { record: Row; onClose: () => void }) {
  const { data, allow } = useStore(),
    action = useAction();
  const [state, setState] = useState<RecommendationState>(
      TRANSITIONS[record.state as RecommendationState][0] || 'Under Review',
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [evidence, setEvidence] = useState<string | null>(null);
  const approvals = data?.approvals.filter((a) => a.recommendation_id === record.id) || [];
  const allowed = TRANSITIONS[record.state as RecommendationState];
  return (
    <>
      <Modal title="Recommendation review" wide onClose={onClose}>
        <div className="detail-top">
          <Badge>{record.id.slice(0, 8)}</Badge>
          <Status value={record.state} />
        </div>
        <h3 className="detail-title">{record.title}</h3>
        <p className="muted">{record.problem}</p>
        <KeyValue
          data={{
            'Responsible owner':
              data?.members.find((m) => m.user_id === record.owner_id)?.full_name ||
              record.owner_id,
            'Last review': dateLabel(record.review_date),
            'Expected benefit': record.expected_benefit,
          }}
        />
        <h4>Original proposed action</h4>
        <JsonView value={record.proposed_action} />
        <h4>Supporting evidence</h4>
        <div className="evidence-links">
          {(record.evidence_ids as string[]).map((id) => (
            <button key={id} onClick={() => setEvidence(id)}>
              <FileText size={17} />
              <span>{data?.evidence_records.find((e) => e.id === id)?.question || id}</span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
        <div className="two-col mt-5">
          <div>
            <h4>Assumptions</h4>
            <ul className="detail-list">
              {record.assumptions.map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Limitations</h4>
            <ul className="detail-list">
              {record.limitations.map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        {approvals.length > 0 && (
          <section className="history-block">
            <h4>
              <History size={16} /> Decision history
            </h4>
            {approvals.map((a) => (
              <div key={a.id}>
                <Status value={a.decision} />
                <p>{a.reason}</p>
                <small>
                  {data?.members.find((m) => m.user_id === a.reviewer_id)?.full_name} ·{' '}
                  {dateLabel(a.created_at)}
                </small>
                {a.override && (
                  <details>
                    <summary>Approved override differs from original</summary>
                    <JsonView value={a.final_action} />
                  </details>
                )}
              </div>
            ))}
          </section>
        )}
        {record.outcome && (
          <Notice tone="success">
            <strong>Recorded outcome</strong>
            <p>{record.outcome}</p>
          </Notice>
        )}
        {allowed.length > 0 &&
        allow(
          ['Approved', 'Rejected', 'Deferred'].includes(state)
            ? 'approve'
            : state === 'Implemented' || state === 'Outcome Reviewed'
              ? 'operate'
              : 'manage',
        ) ? (
          <form
            className="review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await action(
                () =>
                  api('/recommendations/' + record.id + '/transition', {
                    body: { state, reason, note: reason },
                  }),
                'Decision recorded in the audit trail',
              );
              setBusy(false);
              if (ok) onClose();
            }}
          >
            <h4>Record a human decision</h4>
            <Notice tone="warning">
              Approval records a decision only; it does not execute an operational transaction. The
              proposal owner cannot approve their own recommendation.
            </Notice>
            <div className="two-col">
              <label className="form-field">
                <span>Decision</span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as RecommendationState)}
                >
                  {allowed.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-field">
              <span>Reason / verification / outcome notes *</span>
              <textarea
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe the evidence checked, any override, and the reason for this decision…"
                rows={3}
              />
            </label>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={onClose}>
                Close
              </Button>
              <Button busy={busy} type="submit">
                <ShieldCheck size={16} />
                Record {state.toLowerCase()}
              </Button>
            </div>
          </form>
        ) : (
          <Notice>
            {allowed.length
              ? 'Your role can inspect this recommendation but cannot perform the next transition.'
              : 'This recommendation has completed its recorded decision lifecycle.'}
          </Notice>
        )}
      </Modal>
      {evidence && <EvidenceDetail id={evidence} onClose={() => setEvidence(null)} />}
    </>
  );
}
export function CreateRecommendation({ onClose }: { onClose: () => void }) {
  const { data } = useStore(),
    action = useAction();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Draft an evidence-backed recommendation" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const ok = await action(
            () =>
              api('/projects/' + data!.project.id + '/recommendations', {
                body: Object.fromEntries(f),
              }),
            'Draft recommendation created',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <label className="form-field">
          <span>Title *</span>
          <input name="title" required maxLength={160} />
        </label>
        <label className="form-field">
          <span>Problem addressed *</span>
          <textarea name="problem" required rows={2} />
        </label>
        <label className="form-field">
          <span>Proposed action *</span>
          <textarea name="action" required rows={3} />
        </label>
        <label className="form-field">
          <span>Expected benefit *</span>
          <input name="benefit" required />
        </label>
        <label className="form-field">
          <span>Supporting evidence *</span>
          <select name="evidence_id" required>
            <option value="">Select validated evidence</option>
            {data?.evidence_records.map((e) => (
              <option value={e.id} key={e.id}>
                {e.question}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy}>
            <Send size={15} />
            Create draft
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ReportPreview({ record, onClose }: { record: Row; onClose: () => void }) {
  const { data } = useStore();
  return (
    <Modal title={record.title} wide onClose={onClose}>
      <div className="detail-top">
        <Status value={record.status} />
        <Badge>Version {record.version}</Badge>
        <Button
          variant="secondary"
          onClick={() =>
            download('afriscope-report-' + record.id + '.md', record.content, 'text/markdown')
          }
        >
          <FileText size={15} />
          Export Markdown
        </Button>
      </div>
      <div className="report-paper">
        {record.content
          .split('\n')
          .map((line: string, i: number) =>
            line.startsWith('# ') ? (
              <h2 key={i}>{line.slice(2)}</h2>
            ) : line.startsWith('## ') ? (
              <h3 key={i}>{line.slice(3)}</h3>
            ) : line.startsWith('### ') ? (
              <h4 key={i}>{line.slice(4)}</h4>
            ) : line.startsWith('```') ? null : (
              <p key={i}>{line}</p>
            ),
          )}
      </div>
      <h4>Evidence references</h4>
      <ul className="detail-list">
        {record.evidence_ids.map((id: string) => (
          <li key={id}>
            {data?.evidence_records.find((e) => e.id === id)?.question || id}
            <small className="block mono">{id}</small>
          </li>
        ))}
      </ul>
      <Notice>
        <CheckCircle2 size={14} /> This preview is generated from the saved report version. Export
        includes the full computed evidence and assumptions.
      </Notice>
    </Modal>
  );
}
