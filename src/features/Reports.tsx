import { useState } from 'react';
import { FileText, Plus, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore, useAction, type Row } from '../lib/store';
import { api } from '../lib/api';
import { PageHeader, Button, Status, Badge, Notice, Modal } from '../components/ui';
import { ReportPreview } from '../components/workflow';
import { EmptyState } from '../components/EmptyState';
import { dateLabel } from '../../shared/domain';
export function Reports() {
  const { data, allow } = useStore();
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  const evidenceCount = (data?.evidence_records || []).length;
  return (
    <>
      <PageHeader
        eyebrow="REPORTS & DOCUMENTS"
        title="Evidence that travels with the decision."
        description="Generate, review, version, and export reports with their methods, assumptions, and source references intact."
      >
        <Button onClick={() => setCreate(true)} disabled={!allow('manage')}>
          <Plus size={16} />
          Generate report
        </Button>
      </PageHeader>
      <div className="report-catalogue">
        {data?.reports.map((r) => (
          <button key={r.id} className="report-card" onClick={() => setSelected(r)}>
            <div className="report-card-art">
              <FileText size={42} />
              <span>AFRISCOPE AI</span>
              <div className="paper-lines">
                <i />
                <i />
                <i />
              </div>
              <Badge>Version {r.version}</Badge>
            </div>
            <div className="report-card-content">
              <span className="eyebrow">{r.kind}</span>
              <h2>{r.title}</h2>
              <p>
                {r.evidence_ids.length} evidence references · {dateLabel(r.created_at)}
              </p>
              <footer>
                <Status value={r.status} />
                <ArrowUpRight size={17} />
              </footer>
            </div>
          </button>
        ))}
      </div>
      {!data?.reports.length &&
        (evidenceCount > 0 ? (
          // Only claim evidence is ready when evidence records actually exist.
          <EmptyState
            title="No reports yet — your saved evidence is ready to compile"
            description={`${evidenceCount} evidence record(s) can be referenced in a portable Markdown report.`}
            action={
              <Button onClick={() => setCreate(true)} disabled={!allow('manage')}>
                Generate report
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No reports yet, and no saved evidence to report on"
            description="Run an analysis first (Programme Operations → Recalculate, or Data Intelligence → forecast). Every result is saved with its method, assumptions and source versions, and can then be reported."
            action={
              <Link to="/operations" className="btn btn-secondary">
                Run an analysis
              </Link>
            }
          />
        ))}
      <Notice>
        Exports contain the saved evidence snapshot, including large computed result objects.
        Reports do not imply approval of the recommended actions.
      </Notice>
      {selected && <ReportPreview record={selected} onClose={() => setSelected(null)} />}{' '}
      {create && <CreateReport onClose={() => setCreate(false)} />}
    </>
  );
}
function CreateReport({ onClose }: { onClose: () => void }) {
  const { data } = useStore(),
    action = useAction();
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  return (
    <Modal title="Generate an evidence-backed report" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const ok = await action(
            () =>
              api('/projects/' + data!.project.id + '/reports', {
                body: { title: f.get('title'), kind: f.get('kind'), evidence_ids: selected },
              }),
            'Report generated and saved as version 1',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <label className="form-field">
          <span>Report title *</span>
          <input name="title" required maxLength={160} />
        </label>
        <label className="form-field">
          <span>Report type</span>
          <select name="kind">
            <option>Executive evidence brief</option>
            <option>Model evaluation</option>
            <option>Data quality and operations</option>
            <option>Responsible AI assessment</option>
          </select>
        </label>
        <fieldset className="evidence-select">
          <legend>Include validated evidence *</legend>
          {data?.evidence_records.map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={(ev) =>
                  setSelected(
                    ev.target.checked ? [...selected, e.id] : selected.filter((id) => id !== e.id),
                  )
                }
              />
              <span>
                {e.question}
                <small>
                  {e.method} · {e.reporting_period}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <Notice>
          Each selected evidence record contributes its actual computed result, sources, assumptions
          and limitations. No external LLM is used to generate this report.
        </Notice>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!selected.length}>
            <FileText size={15} />
            Generate report
          </Button>
        </div>
      </form>
    </Modal>
  );
}
