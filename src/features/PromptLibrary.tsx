import { useEffect, useState } from 'react';
import { Play, ShieldAlert } from 'lucide-react';
import { useStore } from '../lib/store';
import { api, download } from '../lib/api';
import { Panel, Button, Notice, Badge } from '../components/ui';
import { SAMPLE_BADGE_TEXT } from '../components/origin';

type SavedPrompt = {
  id: string;
  group: string;
  title: string;
  prompt: string;
  requires: string[];
  unverified_claims?: string[];
};

type PromptRun = {
  prompt_id: string;
  prompt_title: string;
  prompt: string;
  scope: 'sample' | 'real' | 'both';
  scope_statement: string;
  status: 'answered' | 'insufficient_data';
  answer: string;
  missing: string[];
  sample_label: string | null;
  uses_sample_data: boolean;
  unverified_claims: string[];
  limitations: string[];
  rows: Array<Record<string, unknown>>;
};

export function PromptLibrary() {
  const { project, notify, allow } = useStore();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [rules, setRules] = useState<string[]>([]);
  const [scope, setScope] = useState<'sample' | 'real' | 'both'>('both');
  const [runs, setRuns] = useState<Record<string, PromptRun>>({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<{ prompts: SavedPrompt[]; behaviour_rules: string[] }>('/prompts')
      .then((r) => {
        setPrompts(r.prompts || []);
        setRules(r.behaviour_rules || []);
      })
      .catch(() => setPrompts([]));
  }, []);

  if (!project) return null;
  const groups = [...new Set(prompts.map((p) => p.group))];

  const run = async (id: string) => {
    setBusy(id);
    try {
      const r = await api<PromptRun>(`/projects/${project.id}/prompts/${id}/run`, {
        body: { scope },
      });
      setRuns((prev) => ({ ...prev, [id]: r }));
    } catch (e) {
      notify((e as Error).message, true);
    }
    setBusy('');
  };

  return (
    <Panel
      title="Saved prompts"
      subtitle="Seven numbered analysis prompts plus four context prompts. Every answer is computed from rows already in this workspace."
      action={
        <div className="scope-selector" role="group" aria-label="Data scope for prompt runs">
          <span className="origin-filter-label">Data scope</span>
          {(['sample', 'real', 'both'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={scope === s ? 'chip active' : 'chip'}
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
            >
              {s === 'both' ? 'Both' : s === 'sample' ? 'Sample' : 'Real'}
            </button>
          ))}
        </div>
      }
    >
      <Notice>
        Prompts run only against data in this workspace. If the rows a prompt needs are absent, the
        answer says exactly what is missing — no facility, stock level or financing signal is
        invented. Output is non-binding decision support and needs human review.
      </Notice>
      {groups.map((group) => (
        <div className="prompt-group" key={group}>
          <h4>{group}</h4>
          <ol className="prompt-list" start={group.startsWith('Context') ? 1 : undefined}>
            {prompts
              .filter((p) => p.group === group)
              .map((p, i) => {
                const result = runs[p.id];
                return (
                  <li key={p.id}>
                    <div className="prompt-head">
                      <b>
                        {group.startsWith('Context') ? `C${i + 1}` : `${prompts.indexOf(p) + 1}`}.{' '}
                        {p.title}
                      </b>
                      <Button
                        variant="secondary"
                        busy={busy === p.id}
                        disabled={!allow('read')}
                        onClick={() => run(p.id)}
                      >
                        <Play size={14} /> Run prompt
                      </Button>
                    </div>
                    <p className="prompt-text">{p.prompt}</p>
                    {p.unverified_claims?.length ? (
                      <UnverifiedNote claims={p.unverified_claims} />
                    ) : null}
                    {result && (
                      <div className="prompt-answer">
                        <div className="answer-meta">
                          <Badge tone={result.status === 'answered' ? 'green' : 'amber'}>
                            {result.status === 'answered' ? 'Answered' : 'Insufficient data'}
                          </Badge>
                          <span className="muted">{result.scope_statement}</span>
                        </div>
                        {result.uses_sample_data && (
                          <div className="sample-ribbon">{SAMPLE_BADGE_TEXT}</div>
                        )}
                        <pre className="answer-body">{result.answer}</pre>
                        {result.rows.length > 0 && (
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>Facility</th>
                                <th>Medicine</th>
                                <th>Stock</th>
                                <th>Per day</th>
                                <th>Coverage</th>
                                <th>As of</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.rows.map((r, k) => (
                                <tr key={k}>
                                  <td>
                                    {String(r.facility)}
                                    {r.data_origin === 'sample' ? ' *' : ''}
                                  </td>
                                  <td>{String(r.medicine)}</td>
                                  <td>{String(r.usable_stock)}</td>
                                  <td>{String(r.avg_daily_consumption ?? '—')}</td>
                                  <td>{String(r.coverage_days ?? 'n/a')}</td>
                                  <td>{String(r.as_of_date)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <ul className="limitation-list">
                          {result.limitations.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            download(
                              `prompt-${result.prompt_id}-${result.scope}.md`,
                              [
                                result.uses_sample_data ? `> ${SAMPLE_BADGE_TEXT}\n` : '',
                                `# ${result.prompt_title}`,
                                result.scope_statement,
                                '',
                                result.prompt,
                                '',
                                result.answer,
                                '',
                                'Limitations:',
                                ...result.limitations.map((l) => `- ${l}`),
                              ].join('\n'),
                              'text/markdown',
                            )
                          }
                        >
                          Export answer
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
          </ol>
        </div>
      ))}
      {rules.length > 0 && (
        <div className="behaviour-rules">
          <h4>How these prompts behave</h4>
          <ul>
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/**
 * Explains an unverified claim in plain words, in place. The register lives in
 * the repository for auditors, but a programme manager should not have to open a
 * markdown file to understand a warning (Part 2.4).
 */
function UnverifiedNote({ claims }: { claims: string[] }) {
  return (
    <details className="unverified-flag">
      <summary>
        <ShieldAlert size={14} /> Contains a claim nobody has verified yet
      </summary>
      <div className="unverified-body">
        <p>
          This prompt contains {claims.length === 1 ? 'a statement' : 'statements'} about the
          external world that this build has not checked against a source. If an answer repeats it,
          treat it as something to confirm — not as a finding.
        </p>
        <ul>
          {claims.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="muted">
          The full list, with sources to check and their status, is kept in the project repository
          at <code>docs/content-claims.md</code>.
        </p>
      </div>
    </details>
  );
}
