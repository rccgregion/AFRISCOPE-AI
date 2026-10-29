import { useState, useEffect } from 'react';
import {
  Upload,
  Download,
  Database,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  FlaskConical,
  ChartNoAxesCombined,
  ArrowUpRight,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, upload, exportCSV } from '../lib/api';
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
  Empty,
  KeyValue,
  JsonView,
} from '../components/ui';
import { TimeChart } from '../components/charts';
import { requiredFields } from '../../server/validation';
import { dateLabel } from '../../shared/domain';
export function DataIntelligence() {
  const { data, project, allow } = useStore();
  const [tab, setTab] = useState('Data catalogue'),
    [wizard, setWizard] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  return (
    <>
      <PageHeader
        eyebrow="DATA & DECISION INTELLIGENCE"
        title="Good decisions need trustworthy inputs."
        description="Import, inspect, and understand your data before asking it to guide a decision."
      >
        <a className="btn btn-secondary" href="/demo/inventory_defects.csv" download>
          <FlaskConical size={16} />
          Defect fixture
        </a>
        <Button onClick={() => setWizard(true)} disabled={!allow('data')}>
          <Upload size={16} />
          Import dataset
        </Button>
      </PageHeader>
      <Tabs
        items={[
          'Data catalogue',
          'Import history',
          'Quality report',
          'Data dictionary',
          'Analytics workspace',
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'Data catalogue' && (
        <>
          <div className="data-intro">
            <span className="data-intro-icon">
              <Database size={25} />
            </span>
            <div>
              <h3>A single, traceable source of project evidence.</h3>
              <p>
                Datasets are versioned. Imports retain rejected records. Internal uploads require a
                documented lawful-use review.
              </p>
            </div>
            <Badge tone="green">{data?.datasets.length || 0} datasets</Badge>
          </div>
          <div className="dataset-grid">
            {data?.datasets.map((d) => (
              <button className="dataset-card" key={d.id} onClick={() => setSelected(d)}>
                <div>
                  <span className="file-icon">
                    <FileSpreadsheet size={23} />
                  </span>
                  <Status value={d.quality_status} />
                </div>
                <h3>{d.name}</h3>
                <p>{d.description}</p>
                <div className="dataset-meta">
                  <span>{d.kind.replaceAll('_', ' ')}</span>
                  <span>
                    {data.dataset_versions.filter((v) => v.dataset_id === d.id).length} version(s)
                  </span>
                </div>
                <footer>
                  <span>
                    <ShieldIcon />
                    {d.sensitivity}
                  </span>
                  <ArrowUpRight size={17} />
                </footer>
              </button>
            ))}
          </div>
          {!data?.datasets.length && (
            <Empty
              title="Bring your first dataset"
              description="CSV and XLSX imports are validated before any record enters the analytical workspace."
              action={
                <Button disabled={!allow('data')} onClick={() => setWizard(true)}>
                  Import a dataset
                </Button>
              }
            />
          )}
          <Panel
            title="Available synthetic downloads"
            subtitle="Fixed seed 20260930. All places and operational records are fictional."
          >
            <div className="download-grid">
              {[
                'inventory',
                'consumption',
                'deliveries',
                'facilities',
                'medicine_products',
                'budgets',
                'funding_releases',
                'procurement_events',
                'expenditure_records',
                'intervention_options',
                'budget_scenarios',
                'inventory_defects',
              ].map((name) => (
                <a key={name} href={'/demo/' + name + '.csv'} download>
                  <FileSpreadsheet size={17} />
                  <span>{name.replaceAll('_', ' ')}.csv</span>
                  <Download size={15} />
                </a>
              ))}
            </div>
          </Panel>
        </>
      )}
      {tab === 'Import history' && (
        <Panel
          title="Import history"
          subtitle="Preview, mapping, validation, and rejection counts are persisted for every import."
        >
          <Table
            rows={data?.data_import_jobs || []}
            label="Imports"
            columns={[
              { key: 'filename', label: 'File' },
              { key: 'kind', label: 'Schema' },
              { key: 'created_at', label: 'Imported', render: (r) => dateLabel(r.created_at) },
              { key: 'accepted_count', label: 'Accepted' },
              {
                key: 'rejected_count',
                label: 'Rejected',
                render: (r) => (
                  <Badge tone={r.rejected_count ? 'amber' : 'green'}>{r.rejected_count}</Badge>
                ),
              },
              { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {tab === 'Quality report' && (
        <div className="stack">
          <Notice>
            Structural validity is measured from available records. Accuracy against real
            operational conditions cannot be verified without a trusted external reference.
          </Notice>
          {data?.data_quality_results.map((q) => (
            <Panel
              key={q.id}
              title={data.datasets.find((d) => d.id === q.dataset_id)?.name || 'Dataset quality'}
              subtitle={'Version ' + q.version_id.slice(0, 8)}
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportCSV('quality-report.csv', [
                      {
                        dataset_id: q.dataset_id,
                        version_id: q.version_id,
                        ...q.metrics,
                        issues: q.issues,
                      },
                    ])
                  }
                >
                  <Download size={15} />
                  Export report
                </Button>
              }
            >
              <div className="quality-metrics">
                <div>
                  <strong>{q.metrics.records}</strong>
                  <span>Records inspected</span>
                </div>
                <div>
                  <strong>{q.metrics.validity_percent ?? '—'}%</strong>
                  <span>Valid / accepted</span>
                </div>
                <div>
                  <strong>{q.metrics.rejected}</strong>
                  <span>Rejected & retained</span>
                </div>
              </div>
              {q.issues.length > 0 ? (
                <Table
                  rows={q.issues}
                  label="Quality issues"
                  columns={[
                    { key: 'type', label: 'Issue type' },
                    { key: 'field', label: 'Field' },
                    { key: 'count', label: 'Records' },
                    {
                      key: 'severity',
                      label: 'Severity',
                      render: (r) => <Status value={r.severity} />,
                    },
                    { key: 'remediation', label: 'Remediation' },
                    { key: 'status', label: 'Resolution' },
                  ]}
                />
              ) : (
                <div className="quality-pass">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>No structural issues detected in this clean snapshot.</strong>
                    <p>This is not an accuracy, fairness, or real-world validity certification.</p>
                  </div>
                </div>
              )}
              <details className="p-5">
                <summary>Completeness by field and quality limitations</summary>
                <JsonView
                  value={{ completeness: q.metrics.completeness, limitations: q.limitations }}
                />
              </details>
            </Panel>
          ))}
        </div>
      )}
      {tab === 'Data dictionary' && (
        <Panel
          title="Dataset field dictionary"
          subtitle="Business definitions, data types, units, validation, and relationships."
        >
          <div className="p-5">
            <label className="form-field">
              <span>Dataset</span>
              <select
                value={selected?.id || data?.datasets[0]?.id || ''}
                onChange={(e) =>
                  setSelected((data!.datasets.find((d) => d.id === e.target.value) as Row) || null)
                }
              >
                {data?.datasets.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Table
            rows={
              data?.data_dictionary_entries.filter(
                (d) => d.dataset_id === (selected?.id || data?.datasets[0]?.id),
              ) || []
            }
            label="Dictionary fields"
            pageSize={12}
            columns={[
              { key: 'field_name', label: 'Field' },
              { key: 'definition', label: 'Definition' },
              { key: 'data_type', label: 'Type' },
              { key: 'unit', label: 'Unit' },
              {
                key: 'required',
                label: 'Required',
                render: (r) => (r.required ? 'Yes' : 'Optional'),
              },
              { key: 'example', label: 'Example' },
              { key: 'validation_rule', label: 'Validation' },
            ]}
            onRowClick={setSelected}
          />
        </Panel>
      )}
      {tab === 'Analytics workspace' && <Analytics />}
      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
      {selected && data?.datasets.some((d) => d.id === selected.id) && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <KeyValue
            data={{
              Owner: selected.owner,
              Source: selected.source,
              Sensitivity: selected.sensitivity,
              'Reporting period': selected.reporting_period,
              Coverage: selected.geographic_coverage,
              'Schema version': selected.schema_version,
              Access: selected.access_policy,
              Lineage: selected.lineage,
            }}
          />
          <h4>Immutable versions</h4>
          <Table
            rows={data.dataset_versions.filter((v) => v.dataset_id === selected.id)}
            columns={[
              { key: 'version', label: 'Version' },
              { key: 'row_count', label: 'Records' },
              { key: 'period_end', label: 'Period end', render: (r) => dateLabel(r.period_end) },
              {
                key: 'checksum',
                label: 'SHA-256',
                render: (r) => <span className="mono small">{r.checksum.slice(0, 16)}…</span>,
              },
            ]}
          />
          <Notice>
            Uploaded datasets are classified Internal. External AI calls exclude sensitive evidence
            and require explicit server configuration.
          </Notice>
        </Modal>
      )}
      {selected && data?.data_import_jobs.some((j) => j.id === selected.id) && (
        <Modal title="Import validation result" wide onClose={() => setSelected(null)}>
          <KeyValue
            data={{
              File: selected.filename,
              Accepted: selected.accepted_count,
              Rejected: selected.rejected_count,
              Status: selected.status,
            }}
          />
          <h4>Column mapping</h4>
          <JsonView value={selected.mapping} />
          <h4>Rejection report</h4>
          <Table
            rows={selected.rejections}
            columns={[
              { key: 'row', label: 'Source row' },
              { key: 'field', label: 'Field' },
              { key: 'reason', label: 'Reason' },
            ]}
          />
          <a
            className="btn btn-secondary"
            href={'/api/imports/' + selected.id + '/rejections'}
            download
          >
            <Download size={15} />
            Download rejected records
          </a>
        </Modal>
      )}
      {selected && data?.data_dictionary_entries.some((d) => d.id === selected.id) && (
        <Modal title={selected.field_name} onClose={() => setSelected(null)}>
          <KeyValue
            data={Object.fromEntries(
              Object.entries(selected)
                .filter(
                  ([k]) =>
                    !['id', 'project_id', 'organisation_id', 'created_by', 'updated_at'].includes(
                      k,
                    ),
                )
                .map(([k, v]) => [k.replaceAll('_', ' '), String(v ?? '—')]),
            )}
          />
        </Modal>
      )}
    </>
  );
}
function ShieldIcon() {
  return <CheckCircle2 size={13} />;
}
function ImportWizard({ onClose }: { onClose: () => void }) {
  const { project } = useStore(),
    action = useAction();
  const [stage, setStage] = useState(0),
    [kind, setKind] = useState('inventory'),
    [file, setFile] = useState<File | null>(null),
    [job, setJob] = useState<Row | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [name, setName] = useState(''),
    [result, setResult] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Import and validate a dataset" wide onClose={onClose}>
      <div className="wizard-progress">
        {['Choose source', 'Map columns', 'Validate & import'].map((s, i) => (
          <div className={i <= stage ? 'active' : ''} key={s}>
            <span>{i < stage ? <CheckCircle2 size={15} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {stage === 0 && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              const j = await upload('/projects/' + project!.id + '/imports/preview', file, kind);
              setJob(j);
              setMapping(
                Object.fromEntries(
                  requiredFields[kind].map((f) => [
                    f,
                    j.columns.find((c: string) => c.toLowerCase() === f.toLowerCase()) || '',
                  ]),
                ),
              );
              setName(file.name.replace(/\.[^.]+$/, ''));
              setStage(1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="form-field">
            <span>Data schema</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                'inventory',
                'budgets',
                'funding_releases',
                'procurement_events',
                'expenditure_records',
              ].map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="upload-zone">
            <Upload size={30} />
            <strong>{file ? file.name : 'Choose a CSV or XLSX file'}</strong>
            <span>CSV up to 5 MB · XLSX up to 2 MB · 5,000 rows maximum</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <Notice>
            Imports are complete source snapshots for the selected schema, not incremental patches.
            Financial amounts use major currency units with up to two decimals. Inventory uses whole
            product units.
          </Notice>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!file} busy={busy}>
              Preview & map <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      )}
      {stage === 1 && job && (
        <div className="form-stack">
          <p className="muted">
            Map every required field to a distinct source column. Unmapped and rejected rows remain
            in the import report.
          </p>
          <div className="mapping-grid">
            {requiredFields[kind].map((f) => (
              <label className="form-field" key={f}>
                <span>{f.replaceAll('_', ' ')} *</span>
                <select
                  value={mapping[f] || ''}
                  onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                >
                  <option value="">Choose source column</option>
                  {job.columns.map((c: string) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h4>Source preview · first 5 rows</h4>
          <Table
            rows={job.preview_rows.slice(0, 5)}
            label="Source preview"
            columns={job.columns.slice(0, 7).map((c: string) => ({ key: c, label: c }))}
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStage(0)}>
              Back
            </Button>
            <Button
              onClick={() => setStage(2)}
              disabled={
                requiredFields[kind].some((f) => !mapping[f]) ||
                new Set(Object.values(mapping)).size !== Object.values(mapping).length
              }
            >
              Review import <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}
      {stage === 2 && !result && (
        <div className="form-stack">
          <label className="form-field">
            <span>Dataset name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </label>
          <KeyValue
            data={{
              'Source file': job?.filename,
              'Source rows': job?.preview_rows.length,
              Schema: kind,
              Project: project?.title,
            }}
          />
          <Notice tone="warning">
            Validation runs on the server. Valid rows create a new immutable dataset version. If
            every row is rejected, no analytical version is created. Every rejected row is retained
            with its original values, reason, and remediation.
          </Notice>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStage(1)}>
              Back to mapping
            </Button>
            <Button
              busy={busy}
              disabled={!name.trim()}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const r = await api<Row>('/imports/' + job!.id + '/commit', {
                    body: { mapping, name },
                  });
                  setResult(r);
                  await action(async () => {}, 'Import validation recorded');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CheckCircle2 size={16} />
              Validate & import
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div className="form-stack">
          <div className="import-success">
            <CheckCircle2 size={38} />
            <h3>
              {result.version
                ? 'Import version created'
                : 'Import rejected — no source version created'}
            </h3>
            <p>
              {result.job.accepted_count} accepted · {result.job.rejected_count} rejected and
              retained
            </p>
          </div>
          <Table
            rows={result.quality.issues}
            label="Validation issues"
            columns={[
              { key: 'field', label: 'Field' },
              { key: 'count', label: 'Rows' },
              { key: 'remediation', label: 'How to resolve' },
              { key: 'status', label: 'Status' },
            ]}
          />
          <Notice>
            Recalculate the relevant analysis to use this new source version. Existing reports
            retain their earlier evidence snapshot.
          </Notice>
          <div className="modal-actions">
            {result.job.rejected_count > 0 && (
              <a
                className="btn btn-secondary"
                href={'/api/imports/' + job!.id + '/rejections'}
                download
              >
                <Download size={15} />
                Rejection CSV
              </a>
            )}
            <Button onClick={onClose}>
              Return to catalogue <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
function Analytics() {
  const { project, allow } = useStore(),
    action = useAction();
  const [forecast, setForecast] = useState<Row | null>(null),
    [series, setSeries] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (project)
      api<Row>('/projects/' + project.id + '/forecast')
        .then(setForecast)
        .catch((e) => setError(e.message));
  }, [project]);
  const current = forecast?.series[series];
  return (
    <div className="stack">
      <div className="section-toolbar">
        <Notice>
          Forecasts estimate recorded consumption, not uncensored demand. Model selection uses
          validation weeks; test weeks remain held out.
        </Notice>
        <Button
          busy={busy}
          disabled={!allow('data')}
          onClick={async () => {
            setBusy(true);
            const ok = await action(
              () => api('/projects/' + project!.id + '/analysis', { body: { kind: 'forecast' } }),
              'Forecast evaluated and evidence saved',
            );
            if (ok) {
              try {
                setForecast(await api('/projects/' + project!.id + '/forecast'));
              } catch (e) {
                setError((e as Error).message);
              }
            }
            setBusy(false);
          }}
        >
          <RefreshCw size={16} />
          Run baseline evaluation
        </Button>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {forecast && current ? (
        <>
          <Panel
            title="Consumption forecast and held-out estimates"
            subtitle={current.name}
            action={<Badge tone="blue">{forecast.best_method}</Badge>}
          >
            <div className="p-5 pb-0">
              <label className="form-field">
                <span>Facility / medicine series</span>
                <select value={series} onChange={(e) => setSeries(Number(e.target.value))}>
                  {forecast.series.map((s: Row, i: number) => (
                    <option key={s.key} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TimeChart data={current.points} forecast unit="Weekly consumption · product units" />
            <div className="panel-foot">
              <ChartNoAxesCombined size={15} />
              Shaded future bounds are empirical sensitivity envelopes, not calibrated prediction
              intervals.
            </div>
          </Panel>
          <div className="two-col">
            <Panel title="Held-out test performance" subtitle={forecast.test_period}>
              <Table
                rows={forecast.test}
                columns={[
                  { key: 'method', label: 'Method' },
                  { key: 'mae', label: 'MAE', render: (r) => r.mae.toFixed(2) },
                  {
                    key: 'wape',
                    label: 'WAPE',
                    render: (r) =>
                      r.wape === null ? 'Undefined' : (r.wape * 100).toFixed(1) + '%',
                  },
                  { key: 'bias', label: 'Bias', render: (r) => r.bias.toFixed(2) },
                  { key: 'n', label: 'Obs.' },
                ]}
              />
            </Panel>
            <Panel title="Evaluation conditions">
              <KeyValue
                data={{
                  'Training period': forecast.train_period,
                  'Validation period': forecast.validation_period,
                  'Test period': forecast.test_period,
                  Horizon: '4 weeks',
                  'Series evaluated': forecast.series_evaluated,
                  'Selection criterion': 'Validation MAE; lower is better',
                }}
              />
            </Panel>
          </div>
          <Panel
            title="Subgroup test performance"
            subtitle="Small subgroups do not establish fairness or absence of disparities."
          >
            <Table
              rows={forecast.subgroup}
              columns={[
                { key: 'field', label: 'Dimension' },
                { key: 'group', label: 'Group' },
                { key: 'series_count', label: 'Series' },
                {
                  key: 'metrics',
                  label: 'Moving average · MAE / WAPE / n',
                  render: (r) => {
                    const m = r.metrics[0];
                    return (
                      m.mae.toFixed(2) +
                      ' / ' +
                      (m.wape === null ? '—' : (m.wape * 100).toFixed(1) + '%') +
                      ' / ' +
                      m.n
                    );
                  },
                },
                {
                  key: 'es',
                  label: 'Smoothing · MAE / WAPE / n',
                  render: (r) => {
                    const m = r.metrics[1];
                    return (
                      m.mae.toFixed(2) +
                      ' / ' +
                      (m.wape === null ? '—' : (m.wape * 100).toFixed(1) + '%') +
                      ' / ' +
                      m.n
                    );
                  },
                },
              ]}
            />
          </Panel>
          <Panel title="Limitations">
            <ul className="detail-list p-5">
              {forecast.limitations.map((l: string) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Panel>
        </>
      ) : (
        <Empty
          title="No evaluated forecast yet"
          description="Import at least 24 complete weekly observations per series, then run the baseline evaluation."
        />
      )}
    </div>
  );
}
