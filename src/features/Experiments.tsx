import { useState } from 'react';
import {
  FlaskConical,
  Play,
  Plus,
  ArrowUpRight,
  Download,
  GitCompareArrows,
  Clock,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, download } from '../lib/api';
import {
  PageHeader,
  Panel,
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
export function Experiments() {
  const { data, project, allow } = useStore(),
    action = useAction();
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [busy, setBusy] = useState(''),
    [compare, setCompare] = useState(false);
  const experiments = data?.experiments || [],
    completed = experiments.filter((e) => e.status === 'Completed');
  return (
    <>
      <PageHeader
        eyebrow="AI EXPERIMENT LAB"
        title="Test the method. Keep the receipts."
        description="Reproducible configurations, versioned inputs, measured results, and explicit decisions about what comes next."
      >
        <Button
          variant="secondary"
          disabled={completed.length < 1}
          onClick={() => setCompare(true)}
        >
          <GitCompareArrows size={16} />
          Compare runs
        </Button>
        <Button disabled={!allow('data')} onClick={() => setCreate(true)}>
          <Plus size={16} />
          New experiment
        </Button>
      </PageHeader>
      <Notice>
        Baseline experiments execute synchronously in the application. External-model prompt
        comparisons are illustrative until a provider is configured and an evaluation is actually
        run.
      </Notice>
      <div className="experiment-grid">
        {experiments.map((e) => (
          <button key={e.id} className="experiment-card" onClick={() => setSelected(e)}>
            <div>
              <span className="file-icon">
                <FlaskConical size={23} />
              </span>
              <Status value={e.status} />
            </div>
            <h2>{e.name}</h2>
            <p>{e.objective}</p>
            <div className="experiment-tags">
              <Badge>
                {e.method === 'forecast-comparison'
                  ? 'Statistical baseline'
                  : e.method === 'threshold-comparison'
                    ? 'Deterministic rules'
                    : 'External LLM · illustrative'}
              </Badge>
              <span>{e.model_version || 'Unconfigured'}</span>
            </div>
            <footer>
              <span>
                {e.status === 'Draft'
                  ? 'Not executed'
                  : `${data?.experiment_runs.filter((r) => r.experiment_id === e.id).length} run(s)`}
              </span>
              <ArrowUpRight size={17} />
            </footer>
          </button>
        ))}
      </div>
      {!experiments.length && (
        <Empty
          title="Formulate a testable hypothesis"
          description="Start with a deterministic baseline and a fixed dataset version."
          action={<Button onClick={() => setCreate(true)}>Create experiment</Button>}
        />
      )}
      <Panel
        title="Experiment log"
        subtitle="Expected outcomes are not actual results. Measured metrics come only from executed runs."
      >
        <Table
          rows={experiments}
          label="Experiments"
          columns={[
            { key: 'name', label: 'Experiment' },
            { key: 'method', label: 'Method' },
            {
              key: 'dataset_version_id',
              label: 'Dataset version',
              render: (r) => r.dataset_version_id?.slice(0, 8) || 'Not bound',
            },
            { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            {
              key: 'decision',
              label: 'Decision',
              render: (r) => r.decision || 'Awaiting execution',
            },
          ]}
          onRowClick={setSelected}
        />
      </Panel>
      {create && (
        <Modal title="Configure a reproducible experiment" onClose={() => setCreate(false)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await action(
                () =>
                  api('/projects/' + project!.id + '/experiments', {
                    body: {
                      name: f.get('name'),
                      objective: f.get('objective'),
                      hypothesis: f.get('hypothesis'),
                      method: f.get('method'),
                    },
                  }),
                'Experiment configuration saved as Ready',
              );
              if (ok) setCreate(false);
            }}
          >
            <label className="form-field">
              <span>Experiment name *</span>
              <input name="name" required />
            </label>
            <label className="form-field">
              <span>Research question / objective *</span>
              <textarea name="objective" required rows={2} />
            </label>
            <label className="form-field">
              <span>Hypothesis *</span>
              <textarea name="hypothesis" required rows={2} />
            </label>
            <label className="form-field">
              <span>Method</span>
              <select name="method">
                <option value="forecast-comparison">Moving average vs exponential smoothing</option>
                <option value="threshold-comparison">
                  Deterministic stock-risk threshold analysis
                </option>
              </select>
            </label>
            <Notice>
              The current inventory dataset version is bound at creation. MAE, WAPE and bias are
              calculated by application code.
            </Notice>
            <Button>
              Create experiment <ArrowUpRight size={15} />
            </Button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <div className="detail-top">
            <Status value={selected.status} />
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  'experiment-' + selected.id + '.json',
                  JSON.stringify(
                    {
                      experiment: selected,
                      runs: data?.experiment_runs.filter((r) => r.experiment_id === selected.id),
                      results: data?.experiment_results.filter((r) =>
                        data?.experiment_runs.some(
                          (run) => run.experiment_id === selected.id && run.id === r.run_id,
                        ),
                      ),
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
            >
              <Download size={15} />
              Export report
            </Button>
          </div>
          <KeyValue
            data={{
              Objective: selected.objective,
              Hypothesis: selected.hypothesis,
              'Dataset version': selected.dataset_version_id || 'Not bound',
              Configuration: JSON.stringify(selected.configuration),
              'Evaluation criteria': selected.evaluation_criteria,
              'Expected outcome': selected.expected_outcome,
              'Actual outcome': selected.actual_outcome || 'Not executed',
              Limitations: selected.limitations,
              Decision: selected.decision || 'Not decided',
              'Next steps': selected.next_steps || 'Not defined',
            }}
          />
          <h4>Execution history</h4>
          {data?.experiment_runs
            .filter((r) => r.experiment_id === selected.id)
            .map((r) => (
              <div className="run-card" key={r.id}>
                <div>
                  <Status value={r.status} />
                  <span>
                    <Clock size={14} />
                    {r.duration_ms === null
                      ? 'Duration not measured'
                      : r.duration_ms + ' ms measured'}
                  </span>
                  <span>Model cost: not measured</span>
                </div>
                <JsonView value={r.result.test || r.result.summary || r.result} />
                <details>
                  <summary>Failure cases and full configuration</summary>
                  <JsonView value={{ failures: r.failure_cases, configuration: r.configuration }} />
                </details>
              </div>
            ))}
          {!data?.experiment_runs.some((r) => r.experiment_id === selected.id) && (
            <Notice>No run has been executed. No results, costs, or latency are claimed.</Notice>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button
              busy={busy === selected.id}
              disabled={
                !allow('data') ||
                !['forecast-comparison', 'threshold-comparison'].includes(selected.method)
              }
              onClick={async () => {
                setBusy(selected.id);
                const ok = await action(
                  () => api('/experiments/' + selected.id + '/run', { body: {} }),
                  'Experiment executed; results saved',
                );
                setBusy('');
                if (ok) setSelected(null);
              }}
            >
              <Play size={15} />
              Run experiment
            </Button>
          </div>
        </Modal>
      )}
      {compare && (
        <Modal title="Compare measured experiment runs" wide onClose={() => setCompare(false)}>
          <Notice>
            Only completed runs are compared. A lower error is not proof of operational or clinical
            superiority.
          </Notice>
          <Table
            rows={data?.experiment_runs.filter((r) => r.status === 'Completed') || []}
            columns={[
              {
                key: 'experiment',
                label: 'Experiment',
                render: (r) => experiments.find((e) => e.id === r.experiment_id)?.name,
              },
              {
                key: 'created_at',
                label: 'Executed',
                render: (r) => new Date(r.created_at).toLocaleString(),
              },
              {
                key: 'duration_ms',
                label: 'Wall-clock ms',
                render: (r) => r.duration_ms ?? 'Not measured',
              },
              {
                key: 'mae',
                label: 'Best-validation method test MAE',
                render: (r) => {
                  const f = r.result;
                  return (
                    f?.test?.find((m: Row) => m.method === f.best_method)?.mae?.toFixed(3) ||
                    'See run'
                  );
                },
              },
              {
                key: 'wape',
                label: 'Test WAPE',
                render: (r) => {
                  const f = r.result;
                  const m = f?.test?.find((m: Row) => m.method === f.best_method);
                  return m?.wape != null ? (m.wape * 100).toFixed(2) + '%' : 'See run';
                },
              },
            ]}
          />
        </Modal>
      )}
    </>
  );
}
