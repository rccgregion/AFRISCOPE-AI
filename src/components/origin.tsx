import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Notice, Panel } from './ui';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

export const SAMPLE_BADGE_TEXT = 'Sample data - not reported by any facility';

/** Row/card-level label. Rendered for every sample row, never for real rows. */
export function OriginBadge({ origin }: { origin?: string | null }) {
  if (origin !== 'sample') return null;
  return (
    <span className="badge badge-amber sample-badge" title={SAMPLE_BADGE_TEXT}>
      <span className="badge-dot" />
      {SAMPLE_BADGE_TEXT}
    </span>
  );
}

export type OriginScope = 'all' | 'sample' | 'real';

/**
 * Origin filter. Defaults to "all" and, whenever a total is shown, the caller
 * must also render the split so sample and real rows are never silently mixed.
 */
export function OriginFilter({
  value,
  onChange,
  counts,
}: {
  value: OriginScope;
  onChange: (next: OriginScope) => void;
  counts?: { sample: number; real: number };
}) {
  const options: Array<{ id: OriginScope; label: string }> = [
    { id: 'all', label: 'All data' },
    { id: 'sample', label: 'Sample only' },
    { id: 'real', label: 'Real only' },
  ];
  return (
    <div className="origin-filter" role="group" aria-label="Data origin filter">
      <span className="origin-filter-label">Data origin</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'chip active' : 'chip'}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {counts && o.id !== 'all' ? (
            <b className="chip-count">
              {o.id === 'sample' ? counts.sample : counts.real}
            </b>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function matchesScope(origin: string | null | undefined, scope: OriginScope) {
  if (scope === 'all') return true;
  return (origin ?? 'real') === scope;
}

export function MixedOriginWarning({ counts }: { counts: { sample: number; real: number } }) {
  if (!(counts.sample > 0 && counts.real > 0)) return null;
  return (
    <Notice tone="warning">
      This view mixes {counts.sample.toLocaleString()} sample row(s) with{' '}
      {counts.real.toLocaleString()} real row(s). Sample rows are synthetic and are never reported by
      a facility — filter by origin before quoting any total.
    </Notice>
  );
}

/** Reusable empty state pointing at the two things that unblock a module. */
export function NoDataYet({ what, onImport }: { what: string; onImport?: () => void }) {
  return (
    <div className="empty-data">
      <h4>No {what} yet</h4>
      <p>
        Nothing has been cleared or hidden — this workspace simply has no {what} in the selected
        origin. Import real facility and stock files, or restore the labelled sample pack.
      </p>
      <div className="empty-actions">
        {onImport ? (
          <Button onClick={onImport}>Import your real data</Button>
        ) : (
          <Link className="btn btn-primary" to="/data">
            Import your real data
          </Link>
        )}
        <a className="btn btn-secondary" href="/api/import-templates/facilities">
          Facility template
        </a>
        <a className="btn btn-secondary" href="/api/import-templates/stock">
          Stock template
        </a>
      </div>
    </div>
  );
}

type Batch = { id: string; file_name: string | null; created_at: string; row_counts?: unknown; undone_at?: string | null };

/**
 * Administration → Data. Sample-data controls plus the real-data import wizard.
 * Nothing here writes until the user commits.
 */
export function DataControls() {
  const { project, notify, refresh, role } = useStore();
  const isAdmin = ['organisation_admin', 'platform_admin'].includes(role);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState<string>('');
  const [batches, setBatches] = useState<Batch[]>([]);

  const loadBatches = useCallback(async () => {
    if (!project) return;
    try {
      const r = await api<{ batches: Batch[] }>(`/projects/${project.id}/import-batches`);
      setBatches(r.batches || []);
    } catch {
      setBatches([]);
    }
  }, [project]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  if (!project) return null;
  if (!isAdmin)
    return (
      <Panel title="Data origin and sample data">
        <p className="muted">
          Only organisation administrators can clear or restore sample data and import real data.
          Your current role is read-only for this section.
        </p>
      </Panel>
    );

  return (
    <>
      <Panel
        title="Data origin and sample data"
        subtitle="Sample rows are synthetic. Clearing removes only rows tagged sample; real rows are never touched."
        action={
          <Button
            variant="secondary"
            busy={busy === 'dry'}
            onClick={async () => {
              setBusy('dry');
              try {
                setDry(await api<DryRun>(`/projects/${project.id}/sample-data/dry-run`));
              } catch (e) {
                notify((e as Error).message, true);
              }
              setBusy('');
            }}
          >
            Preview what would be removed
          </Button>
        }
      >
        {!dry ? (
          <p className="muted">
            Run the dry run first. It reports, per table, how many sample rows would be deleted and
            how many real rows would be kept. Nothing is deleted by the preview.
          </p>
        ) : (
          <div className="data-controls">
            <div className="dry-run-grid">
              {Object.entries(dry.counts).map(([table, c]) => (
                <div className="dry-run-cell" key={table}>
                  <span className="muted">{table.replaceAll('_', ' ')}</span>
                  <b className={c.sample ? 'text-amber' : ''}>{c.sample} sample</b>
                  <b className={c.real ? 'text-green' : 'muted'}>{c.real} real</b>
                </div>
              ))}
            </div>
            <p>
              <strong>{dry.totals.sample.toLocaleString()}</strong> sample row(s) would be removed;{' '}
              <strong>{dry.totals.real.toLocaleString()}</strong> real row(s) stay. Projects and audit
              history are kept so the empty modules remain navigable.
            </p>
            {!dry.canClear && (
              <Notice tone="warning">
                Clearing is blocked: {dry.blockers.map((b) => b.reason).join(' ')} Remove or re-tag
                the offending real rows first — this operation never deletes real data.
              </Notice>
            )}
            <label className="form-field">
              <span>Type {dry.confirmation_phrase} to confirm</span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={dry.confirmation_phrase}
                aria-label="Clear confirmation phrase"
              />
            </label>
            <div className="inline-actions">
              <Button
                variant="danger"
                disabled={!dry.canClear || confirm !== dry.confirmation_phrase}
                busy={busy === 'clear'}
                onClick={async () => {
                  setBusy('clear');
                  try {
                    const r = await api<{ cleared: boolean; deletedTotal?: number; reason?: string }>(
                      `/projects/${project.id}/sample-data/clear`,
                      { body: { confirmation: confirm } },
                    );
                    setSummary(
                      r.cleared
                        ? `Cleared ${r.deletedTotal ?? 0} sample row(s). Real rows were not touched.`
                        : `Not cleared: ${r.reason}`,
                    );
                    setConfirm('');
                    setDry(null);
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                  setBusy('');
                }}
              >
                Clear sample data
              </Button>
              <Button
                variant="secondary"
                busy={busy === 'restore'}
                onClick={async () => {
                  setBusy('restore');
                  try {
                    const r = await api<{ created?: boolean; facilities?: number; stockRows?: number }>(
                      `/projects/${project.id}/sample-data/restore`,
                      { body: {} },
                    );
                    setSummary(
                      r.created
                        ? `Restored the sample pack (${r.facilities ?? 0} facilities, ${r.stockRows ?? 0} stock rows).`
                        : 'The sample pack was already complete — nothing was duplicated.',
                    );
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                  setBusy('');
                }}
              >
                Restore sample data
              </Button>
            </div>
            {summary && <Notice>{summary}</Notice>}
          </div>
        )}
      </Panel>

      <RealImportWizard onDone={loadBatches} />

      <Panel title="Import history" subtitle="Each committed batch can be undone on its own.">
        {!batches.length ? (
          <p className="muted">No real-data imports have been committed yet.</p>
        ) : (
          <ul className="batch-list">
            {batches.map((b) => (
              <li key={b.id}>
                <div>
                  <b>{b.file_name || 'manual entry'}</b>
                  <span className="muted"> {new Date(b.created_at).toLocaleString()}</span>
                </div>
                {b.undone_at ? (
                  <Badge tone="neutral">Undone</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    busy={busy === b.id}
                    onClick={async () => {
                      setBusy(b.id);
                      try {
                        const r = await api<{ stock_removed: number; facilities_removed: number }>(
                          `/import-batches/${b.id}/undo`,
                          { body: {} },
                        );
                        notify(
                          `Removed ${r.stock_removed} stock row(s) and ${r.facilities_removed} facility record(s) from this batch only.`,
                        );
                        await loadBatches();
                        await refresh();
                      } catch (e) {
                        notify((e as Error).message, true);
                      }
                      setBusy('');
                    }}
                  >
                    Undo this import
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

type DryRun = {
  counts: Record<string, { sample: number; real: number }>;
  totals: { sample: number; real: number };
  blockers: Array<{ table: string; reason: string; rows: number }>;
  canClear: boolean;
  confirmation_phrase: string;
};

type Preview = {
  facilities: { accepted: number; rejections: { row: number; reason: string }[]; warnings: { row: number; reason: string }[] } | null;
  stock: { accepted: number; rejections: { row: number; reason: string }[]; warnings: { row: number; reason: string }[] } | null;
};

/** Upload → map → validate → preview → commit. Nothing is written before commit. */
export function RealImportWizard({ onDone }: { onDone?: () => void }) {
  const { project, notify, refresh } = useStore();
  const [facilitiesCsv, setFacilitiesCsv] = useState('');
  const [stockCsv, setStockCsv] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [stockName, setStockName] = useState('');
  const [policy, setPolicy] = useState<'reject' | 'skip' | 'update'>('reject');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<string>('');

  if (!project) return null;
  const readFile = async (file: File, set: (v: string) => void, name: (v: string) => void) => {
    if (!/\.csv$/i.test(file.name)) {
      notify('Upload a .csv file. XLSX templates download as CSV-compatible sheets.', true);
      return;
    }
    set(await file.text());
    name(file.name);
    setPreview(null);
  };

  const validate = async () => {
    setBusy('preview');
    try {
      setPreview(
        await api<Preview>(`/projects/${project.id}/real-import/preview`, {
          body: {
            facilities_csv: facilitiesCsv || undefined,
            stock_csv: stockCsv || undefined,
          },
        }),
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
    setBusy('');
  };

  const commit = async () => {
    setBusy('commit');
    try {
      const r = await api<{
        committed: boolean;
        written?: { facilitiesWritten: number; stockWritten: number; skipped: number };
        rejections: { row: number; reason: string }[];
      }>(`/projects/${project.id}/real-import/commit`, {
        body: {
          facilities_csv: facilitiesCsv || undefined,
          stock_csv: stockCsv || undefined,
          duplicate_policy: policy,
          file_name: [facilityName, stockName].filter(Boolean).join(' + ') || 'real import',
        },
      });
      setResult(
        r.committed
          ? `Committed ${r.written?.facilitiesWritten ?? 0} facility row(s) and ${r.written?.stockWritten ?? 0} stock row(s) as real data.` +
              (r.rejections.length ? ` ${r.rejections.length} row(s) were rejected and reported.` : '')
          : 'Nothing was committed because no row passed validation.',
      );
      setPreview(null);
      await refresh();
      onDone?.();
    } catch (e) {
      notify((e as Error).message, true);
    }
    setBusy('');
  };

  const rejectionList = [
    ...(preview?.facilities?.rejections ?? []).map((r) => ({ ...r, kind: 'facilities' })),
    ...(preview?.stock?.rejections ?? []).map((r) => ({ ...r, kind: 'stock' })),
  ];
  const warningList = [
    ...(preview?.facilities?.warnings ?? []).map((r) => ({ ...r, kind: 'facilities' })),
    ...(preview?.stock?.warnings ?? []).map((r) => ({ ...r, kind: 'stock' })),
  ];

  return (
    <Panel
      title="Import real data"
      subtitle="Upload the facility file and the stock/signals file. Rows are validated first; nothing is written until you commit."
      action={
        <div className="inline-actions">
          <a className="btn btn-secondary" href="/api/import-templates/facilities">
            Facility template
          </a>
          <a className="btn btn-secondary" href="/api/import-templates/stock">
            Stock template
          </a>
        </div>
      }
    >
      <div className="two-col">
        <label className="form-field">
          <span>Facilities CSV</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0], setFacilitiesCsv, setFacilityName)}
          />
          <small>{facilityName || 'facility_id, facility_name, country, …, source (required)'}</small>
        </label>
        <label className="form-field">
          <span>Stock and signals CSV</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0], setStockCsv, setStockName)}
          />
          <small>{stockName || 'facility_id, medicine, usable_stock_units, …, source (required)'}</small>
        </label>
      </div>
      <label className="form-field">
        <span>If a facility+medicine+date already exists</span>
        <select value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)}>
          <option value="reject">Reject and report (default)</option>
          <option value="skip">Skip the new row</option>
          <option value="update">Replace the existing reading</option>
        </select>
      </label>
      <div className="inline-actions">
        <Button variant="secondary" busy={busy === 'preview'} disabled={!facilitiesCsv && !stockCsv} onClick={validate}>
          Validate and preview
        </Button>
        <Button
          busy={busy === 'commit'}
          disabled={!preview || (!preview.facilities?.accepted && !preview.stock?.accepted)}
          onClick={commit}
        >
          Commit import
        </Button>
      </div>
      {preview && (
        <div className="preview-block">
          <p>
            Valid: <strong>{preview.facilities?.accepted ?? 0}</strong> facility row(s),{' '}
            <strong>{preview.stock?.accepted ?? 0}</strong> stock row(s). Rejected:{' '}
            <strong>{rejectionList.length}</strong>. Warnings: <strong>{warningList.length}</strong>.
          </p>
          {rejectionList.length > 0 && (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Row</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rejectionList.map((r, i) => (
                  <tr key={i}>
                    <td>{r.kind}</td>
                    <td>{r.row}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {warningList.length > 0 && (
            <ul className="warning-list">
              {warningList.map((w, i) => (
                <li key={i}>
                  {w.kind} row {w.row}: {w.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && <Notice>{result}</Notice>}
    </Panel>
  );
}
