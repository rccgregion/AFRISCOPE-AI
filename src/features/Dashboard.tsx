import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  PackageCheck,
  ShieldCheck,
  CircleAlert,
  Database,
  CalendarDays,
  FileText,
  Activity,
  FlaskConical,
  CheckCheck,
  Layers3,
} from 'lucide-react';
import { useStore, type Row } from '../lib/store';
import { api } from '../lib/api';
import { PageHeader, Metric, Panel, Badge, Status, Empty, Button, Notice } from '../components/ui';
import { AssistantPanel } from '../components/Shell';
import { RecommendationDetail, EvidenceDetail } from '../components/workflow';
import { TimeChart } from '../components/charts';
import { dateLabel, number } from '../../shared/domain';
export function Dashboard() {
  const { data, project } = useStore();
  const [stock, setStock] = useState<{ rows: Row[]; as_of: string } | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [evidence, setEvidence] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!project) return;
    let active = true;
    setStock(null);
    api<typeof stock>('/projects/' + project.id + '/stock')
      .then((s) => {
        if (active) setStock(s);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [project]);
  if (!data || !project)
    return (
      <div className="onboarding-empty">
        <Layers3 size={40} />
        <h1>Your workspace starts with a question.</h1>
        <p>Create a project to organise its evidence, decisions, and people.</p>
        <Link className="btn btn-primary" to="/projects">
          Create your first project <ArrowRight size={16} />
        </Link>
      </div>
    );
  const alerts = data.operational_alerts.filter((a) => a.status !== 'Resolved'),
    pending = data.recommendations.filter((r) => ['Draft', 'Under Review'].includes(r.state));
  const lastExperiment = data.experiments.find((e) => e.status === 'Completed');
  const latestReport = data.reports[0];
  const isMed = project.title.includes('Medicine');
  const snapshot = stock?.as_of || '2026-09-30';
  const stale = (Date.now() - Date.parse(snapshot)) / 86400000 > 10;
  const history: Record<string, unknown>[] = [];
  if (stock) {
    for (const r of stock.rows
      .filter((r) => r.product_id === stock.rows[0]?.product_id)
      .slice(0, 1))
      void r;
  }
  return (
    <>
      <PageHeader
        eyebrow="THE DECISION WORKSPACE"
        title={
          isMed
            ? 'See the risks. Shape the next move.'
            : project.sector === 'Public finance'
              ? 'Follow the funding. Find the friction.'
              : 'Better choices start with clear evidence.'
        }
        description={project.description}
      >
        <Link className="btn btn-secondary" to="/reports">
          <FileText size={16} />
          View reports
        </Link>
        <Link
          className="btn btn-primary"
          to={
            isMed
              ? '/operations'
              : project.sector === 'Public finance'
                ? '/operations?tab=Finance'
                : '/planner'
          }
        >
          Explore {isMed ? 'stock risks' : 'priorities'}
          <ArrowUpRight size={16} />
        </Link>
      </PageHeader>
      <div className="overview-context">
        <div>
          <span className="live-dot" />
          <strong>{project.title}</strong>
          <span className="muted">/</span>
          <span>{project.countries}</span>
        </div>
        <Badge>Latest validated source version</Badge>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      <div className="metrics-grid">
        <Metric
          label={isMed ? 'Facilities monitored' : 'Active workstreams'}
          value={
            isMed
              ? new Set(stock?.rows.map((r) => r.facility_id)).size || '—'
              : data.budgets?.length || data.intervention_options.length
          }
          detail={isMed ? 'Across 2 fictional countries' : 'In the current project'}
          to={isMed ? '/operations' : '/planner'}
          icon={<PackageCheck size={18} />}
        />
        <Metric
          label="Elevated risk signals"
          value={alerts.filter((a) => ['Critical', 'High'].includes(a.severity)).length}
          detail="Require verification, not assumptions"
          to="/operations?tab=Alerts"
          tone="amber"
          icon={<CircleAlert size={18} />}
        />
        <Metric
          label="Decisions awaiting review"
          value={pending.length}
          detail="Evidence attached · human-led"
          to="/operations?tab=Approvals"
          tone="blue"
          icon={<ShieldCheck size={18} />}
        />
        <Metric
          label="Validated data sources"
          value={data.datasets.filter((d) => d.quality_status === 'Validated').length}
          detail={`${data.datasets.length} catalogued in this project`}
          to="/data"
          icon={<Database size={18} />}
        />
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Panel
            title={isMed ? 'Medicine availability at a glance' : 'Programme decision priorities'}
            subtitle={
              isMed
                ? 'Usable stock, expected demand, and replenishment timing.'
                : 'Evidence-backed priorities for the current workspace.'
            }
            action={
              <Link className="text-button" to="/operations">
                Open operations <ArrowUpRight size={14} />
              </Link>
            }
          >
            {isMed ? (
              <>
                <div className="snapshot-strip">
                  <span>
                    <CalendarDays size={14} />
                    {dateLabel(snapshot)} snapshot
                  </span>
                  <Badge tone={stale ? 'amber' : 'green'}>
                    {stale ? 'Historical snapshot' : 'Current snapshot'}
                  </Badge>
                  <span>{number(stock?.rows.length)} facility–medicine records</span>
                </div>
                <div className="risk-summary">
                  <div>
                    <strong className="text-red">
                      {stock?.rows.filter((r) => r.risk === 'Critical').length ?? '—'}
                    </strong>
                    <span>Critical risk</span>
                  </div>
                  <div>
                    <strong className="text-amber">
                      {stock?.rows.filter((r) => r.risk === 'Elevated').length ?? '—'}
                    </strong>
                    <span>Elevated risk</span>
                  </div>
                  <div>
                    <strong className="text-green">
                      {stock?.rows.filter((r) => r.risk === 'Stable').length ?? '—'}
                    </strong>
                    <span>Stable coverage</span>
                  </div>
                  <div>
                    <strong>
                      {stock?.rows.filter((r) => r.transfer_opportunity).length ?? '—'}
                    </strong>
                    <span>Transfer options</span>
                  </div>
                </div>
                <div className="priority-table">
                  <div className="priority-table-head">
                    <span>FACILITY / MEDICINE</span>
                    <span>COVERAGE</span>
                    <span>RISK</span>
                    <span />
                  </div>
                  {stock?.rows
                    .filter((r) => r.risk !== 'Stable')
                    .sort((a, b) => (a.days_of_stock ?? 999) - (b.days_of_stock ?? 999))
                    .slice(0, 4)
                    .map((r) => (
                      <Link to="/operations" className="priority-row" key={r.id}>
                        <div>
                          <strong>{r.facility_name}</strong>
                          <span>{r.product_name}</span>
                        </div>
                        <div>
                          <strong>
                            {r.days_of_stock === null
                              ? 'Unavailable'
                              : r.days_of_stock.toFixed(1) + ' days'}
                          </strong>
                          <span>
                            {number(r.usable_stock)} {r.unit} usable
                          </span>
                        </div>
                        <Status value={r.risk} />
                        <ChevronIcon />
                      </Link>
                    ))}
                  {stock && !stock.rows.length && (
                    <Empty
                      title="No inventory in this project"
                      description="Upload inventory to calculate stock coverage."
                      action={
                        <Link to="/data" className="btn btn-secondary">
                          Import data
                        </Link>
                      }
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="p-5">
                {pending.length ? (
                  pending.slice(0, 4).map((r) => (
                    <button
                      className="priority-row w-full"
                      key={r.id}
                      onClick={() => setSelected(r)}
                    >
                      <div>
                        <strong>{r.title}</strong>
                        <span>{r.expected_benefit}</span>
                      </div>
                      <Status value={r.state} />
                      <ChevronIcon />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No pending decisions"
                    description="Create a scenario or draft an evidence-backed recommendation."
                  />
                )}
              </div>
            )}
            <div className="panel-foot">
              <ShieldCheck size={14} />
              <span>Risk is a prompt for investigation, not a finding of misconduct.</span>
              <Link to="/governance">
                How we assess risk <ArrowUpRight size={12} />
              </Link>
            </div>
          </Panel>
          <AssistantPanel />
          <Panel title="From evidence to action" subtitle="A traceable workflow, not a black box.">
            <div className="workflow-steps">
              {[
                {
                  n: '01',
                  title: 'Validate the data',
                  text: 'Check units, completeness, and source versions.',
                  to: '/data',
                  icon: Database,
                },
                {
                  n: '02',
                  title: 'Understand the signal',
                  text: 'Use deterministic rules and evaluated forecasts.',
                  to: '/experiments',
                  icon: Activity,
                },
                {
                  n: '03',
                  title: 'Review the decision',
                  text: 'Keep assumptions visible and people accountable.',
                  to: '/operations?tab=Approvals',
                  icon: CheckCheck,
                },
              ].map((s) => (
                <Link to={s.to} key={s.n}>
                  <span className="step-number">{s.n}</span>
                  <s.icon size={20} />
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
        <div className="dashboard-secondary">
          <Panel title="On your radar" action={<Badge tone="amber">{alerts.length} open</Badge>}>
            <div className="radar-list">
              {alerts.slice(0, 3).map((a, i) => (
                <Link to="/operations?tab=Alerts" key={a.id}>
                  <span className={`radar-icon ${i === 0 ? 'red' : 'amber'}`}>
                    <CircleAlert size={17} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.triggering_condition}</p>
                    <small>{a.category}</small>
                  </div>
                </Link>
              ))}
              {!alerts.length && (
                <Empty
                  title="No open alerts"
                  description="Run an analysis to evaluate current rules."
                />
              )}
            </div>
            <Link className="panel-bottom-link" to="/operations?tab=Alerts">
              View all operational alerts <ArrowRight size={14} />
            </Link>
          </Panel>
          <Panel title="Latest evidence report" action={<FileText size={17} className="muted" />}>
            <div className="report-mini">
              <span className="document-icon">
                <FileText size={28} />
              </span>
              <Badge>Version {latestReport?.version || 1}</Badge>
              <h3>{latestReport?.title || 'No report generated yet'}</h3>
              <p>
                {latestReport
                  ? `${latestReport.evidence_ids.length} evidence references · computed results and assumptions`
                  : 'Generate a report from validated project evidence.'}
              </p>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() =>
                  latestReport ? setEvidence('report') : window.location.assign('/reports')
                }
              >
                {latestReport ? 'Review report' : 'Open report workspace'}
                <ArrowUpRight size={14} />
              </Button>
            </div>
          </Panel>
          <Panel title="Workspace activity" action={<Activity size={16} className="muted" />}>
            <div className="activity-list">
              {data.audit_logs.slice(0, 4).map((a) => (
                <div key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{a.action.replaceAll('.', ' ').replaceAll('_', ' ')}</strong>
                    <p>
                      {data.members.find((m) => m.user_id === a.actor_id)?.full_name ||
                        'Workspace system'}
                    </p>
                    <small>{dateLabel(a.created_at)}</small>
                  </div>
                </div>
              ))}
              {!data.audit_logs.length && (
                <p className="muted p-5">New project activity will appear here.</p>
              )}
            </div>
            <Link className="panel-bottom-link" to="/governance?tab=Audit history">
              View audit trail <ArrowRight size={14} />
            </Link>
          </Panel>
          <div className="experiment-mini">
            <FlaskConical size={18} />
            <div>
              <span>EXPERIMENT LAB</span>
              <strong>{lastExperiment?.name || 'Build your first experiment'}</strong>
              <small>
                {lastExperiment
                  ? 'Completed · inspect measured results'
                  : 'No executed experiment yet'}
              </small>
            </div>
            <Link to="/experiments" aria-label="Open experiment lab">
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </div>
      {history.length > 0 && <TimeChart data={history} />}{' '}
      {selected && <RecommendationDetail record={selected} onClose={() => setSelected(null)} />}{' '}
      {evidence === 'report' && latestReport && (
        <ReportModal report={latestReport} onClose={() => setEvidence(null)} />
      )}{' '}
      {evidence && evidence !== 'report' && (
        <EvidenceDetail id={evidence} onClose={() => setEvidence(null)} />
      )}
    </>
  );
}
function ChevronIcon() {
  return <ArrowUpRight size={15} className="muted" />;
}
import { ReportPreview } from '../components/workflow';
function ReportModal({ report, onClose }: { report: Row; onClose: () => void }) {
  return <ReportPreview record={report} onClose={onClose} />;
}
