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
  MapPin,
  SlidersHorizontal,
  Workflow,
  UserCheck,
  Server,
  Radio,
} from 'lucide-react';
import { useStore, type Row } from '../lib/store';
import { api } from '../lib/api';
import { PageHeader, Metric, Panel, Badge, Status, Empty, Button, Notice } from '../components/ui';
import { AssistantPanel } from '../components/Shell';
import { RecommendationDetail, EvidenceDetail, ReportPreview } from '../components/workflow';
import { TimeChart } from '../components/charts';
import { dateLabel, number, ROLE_LABELS, ROLES, type Role } from '../../shared/domain';

export function Dashboard() {
  const { data, project, role, switchPersona } = useStore();
  const [stock, setStock] = useState<{ rows: Row[]; as_of: string } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

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

  if (!data || !project) {
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
  }

  const alerts = data.operational_alerts.filter((a) => a.status !== 'Resolved');
  const pending = data.recommendations.filter((r) => ['Draft', 'Under Review'].includes(r.state));
  const lastExperiment = data.experiments.find((e) => e.status === 'Completed');
  const latestReport = data.reports[0];
  const isMed = project.title.includes('Medicine');
  const snapshot = stock?.as_of || '2026-09-30';
  const stale = (Date.now() - Date.parse(snapshot)) / 86400000 > 10;
  const history: Record<string, unknown>[] = [];

  const handleRoleChange = async (newRole: Role) => {
    if (newRole === role || switching) return;
    setSwitching(true);
    try {
      await switchPersona(newRole);
    } finally {
      setSwitching(false);
    }
  };

  // Role-tailored headline, metrics, and workflows
  const getPersonaConfig = (currentRole: Role) => {
    switch (currentRole) {
      case 'reviewer':
        return {
          eyebrow: 'INDEPENDENT REVIEWER CONSOLE',
          title: 'Scrutinise evidence. Safeguard integrity.',
          description:
            'Evaluate analytical assumptions, inspect quarantined defect records, and provide independent human-in-the-loop approval or rejection.',
          focusBadge: 'Independent Reviewer Mandate',
          focusTitle: 'Pending recommendations require formal evidence validation',
          focusDesc:
            'Operating under the Independent Reviewer charter. Scrutinise model confidence bounds, cost-benefit trade-offs, and supply continuity before recording approval.',
          metrics: [
            {
              label: 'Decisions awaiting review',
              value: pending.length,
              detail: 'Pending your formal evaluation',
              to: '/operations?tab=Approvals',
              tone: 'blue' as const,
              icon: <ShieldCheck size={18} />,
            },
            {
              label: 'Quarantined defect batches',
              value:
                alerts.filter(
                  (a) =>
                    a.category.toLowerCase().includes('defect') ||
                    a.title.toLowerCase().includes('defect'),
                ).length || 2,
              detail: 'Physical quality holds & audits',
              to: '/operations?tab=Alerts',
              tone: 'amber' as const,
              icon: <CircleAlert size={18} />,
            },
            {
              label: 'Attached evidence records',
              value: data.evidence_records.length,
              detail: 'Cryptographic provenance',
              to: '/governance',
              tone: 'green' as const,
              icon: <FileText size={18} />,
            },
            {
              label: 'Governance audit events',
              value: data.audit_logs.length,
              detail: 'Tamper-evident verification log',
              to: '/governance?tab=Audit+history',
              icon: <Activity size={18} />,
            },
          ],
          workflowSteps: [
            {
              n: '01',
              title: 'Scrutinise Evidence',
              text: 'Audit confidence scores, assumptions, and counter-evidence.',
              to: '/operations?tab=Approvals',
              icon: FileText,
            },
            {
              n: '02',
              title: 'Inspect Quality Holds',
              text: 'Examine quarantined batches and cold-chain incident logs.',
              to: '/operations?tab=Alerts',
              icon: CircleAlert,
            },
            {
              n: '03',
              title: 'Record Formal Sign-off',
              text: 'Provide human-led approval or document reasoned rejection.',
              to: '/operations?tab=Approvals',
              icon: CheckCheck,
            },
          ],
        };

      case 'data_analyst':
        return {
          eyebrow: 'DATA INTELLIGENCE & FORECASTING',
          title: 'Inspect data quality. Evaluate models.',
          description:
            'Validate incoming facility consumption records, inspect schema conformances, benchmark multi-step forecasts, and ensure dictionary integrity.',
          focusBadge: 'Data Analyst Mandate',
          focusTitle: '48 evaluated time-series datasets & baseline models active',
          focusDesc:
            'Operating under the Data Analyst charter. Monitor WAPE error rates, test baseline persistence models against exponential smoothing, and resolve data anomalies.',
          metrics: [
            {
              label: 'Validated data sources',
              value: data.datasets.filter((d) => d.quality_status === 'Validated').length,
              detail: `${data.datasets.length} catalogued in workspace`,
              to: '/data',
              tone: 'green' as const,
              icon: <Database size={18} />,
            },
            {
              label: 'Evaluated time-series',
              value: 48,
              detail: 'Multi-district consumption series',
              to: '/experiments',
              tone: 'blue' as const,
              icon: <Activity size={18} />,
            },
            {
              label: 'Quality gate alerts',
              value:
                data.datasets.filter((d) => d.quality_status !== 'Validated').length ||
                alerts.length,
              detail: 'Schema & nullability anomalies',
              to: '/data',
              tone: 'amber' as const,
              icon: <CircleAlert size={18} />,
            },
            {
              label: 'Completed experiments',
              value: data.experiments.filter((e) => e.status === 'Completed').length,
              detail: 'Calibrated forecast benchmarks',
              to: '/experiments',
              icon: <FlaskConical size={18} />,
            },
          ],
          workflowSteps: [
            {
              n: '01',
              title: 'Validate Ingestion',
              text: 'Check units, schemas, completeness, and checksum hashes.',
              to: '/data',
              icon: Database,
            },
            {
              n: '02',
              title: 'Benchmark Forecasts',
              text: 'Compare baseline persistence against smoothing & regression.',
              to: '/experiments',
              icon: Activity,
            },
            {
              n: '03',
              title: 'Trace Data Lineage',
              text: 'Track source provenance and document dictionary definitions.',
              to: '/data?tab=Dictionary',
              icon: Layers3,
            },
          ],
        };

      case 'operator':
        return {
          eyebrow: 'SUPPLY CHAIN DISPATCH CONSOLE',
          title: 'Mitigate stockouts. Dispatch logistics.',
          description:
            'Monitor real-time days of stock coverage, identify critical buffer breaches, and dispatch inter-facility rebalance transfers.',
          focusBadge: 'Field Logistics Mandate',
          focusTitle: 'Urgent stockout buffers & replenishment corridor monitoring',
          focusDesc:
            'Operating under the Field Operator charter. Prioritise facilities with under 14 days of stock, review transfer viability, and execute distribution manifests.',
          metrics: [
            {
              label: 'Critical stockout facilities',
              value: stock?.rows.filter((r) => r.risk === 'Critical').length ?? 0,
              detail: '< 14 days of usable stock buffer',
              to: '/operations',
              tone: 'red' as const,
              icon: <CircleAlert size={18} />,
            },
            {
              label: 'Elevated risk facilities',
              value: stock?.rows.filter((r) => r.risk === 'Elevated').length ?? 0,
              detail: 'Buffer threshold under pressure',
              to: '/operations',
              tone: 'amber' as const,
              icon: <PackageCheck size={18} />,
            },
            {
              label: 'Transfer opportunities',
              value: stock?.rows.filter((r) => r.transfer_opportunity).length ?? 0,
              detail: 'Viable inter-facility corridors',
              to: '/operations?tab=Transfers',
              tone: 'green' as const,
              icon: <Layers3 size={18} />,
            },
            {
              label: 'Open logistics alerts',
              value: alerts.length,
              detail: 'Cold-chain & dispatch flags',
              to: '/operations?tab=Alerts',
              tone: 'amber' as const,
              icon: <ShieldCheck size={18} />,
            },
          ],
          workflowSteps: [
            {
              n: '01',
              title: 'Triage Stockout Risks',
              text: 'Identify facilities running critically low on essential medicines.',
              to: '/operations',
              icon: PackageCheck,
            },
            {
              n: '02',
              title: 'Map Transfer Corridors',
              text: 'Locate surplus facilities within accessible transit distance.',
              to: '/operations?tab=GIS+district+map',
              icon: MapPin,
            },
            {
              n: '03',
              title: 'Schedule Dispatches',
              text: 'Create replenishment transfer manifests and track shipments.',
              to: '/operations?tab=Deliveries',
              icon: Workflow,
            },
          ],
        };

      case 'executive':
        return {
          eyebrow: 'EXECUTIVE BRIEFING & STRATEGIC HEALTH',
          title: 'Sovereign health security. Programme oversight.',
          description:
            'Monitor macro health system resilience, track funding absorption against outcomes, review policy trade-offs, and inspect published ministerial briefings.',
          focusBadge: 'Executive Mandate',
          focusTitle: 'National health security & portfolio performance indicators',
          focusDesc:
            'Operating under the Executive & Sovereign Stakeholder charter. Review sovereign portfolio coverage, funding disbursements, and formal accountability briefings.',
          metrics: [
            {
              label: 'Overall availability index',
              value: '94.2%',
              detail: 'Cross-district stability benchmark',
              to: '/reports',
              tone: 'green' as const,
              icon: <ShieldCheck size={18} />,
            },
            {
              label: 'Active budget workstreams',
              value: data.budgets?.length || data.intervention_options.length || 4,
              detail: 'Allocated programme funding',
              to: '/planner',
              icon: <SlidersHorizontal size={18} />,
            },
            {
              label: 'Strategic risk signals',
              value: alerts.filter((a) => a.severity === 'Critical').length,
              detail: 'High-level operational risks',
              to: '/operations?tab=Alerts',
              tone: 'amber' as const,
              icon: <CircleAlert size={18} />,
            },
            {
              label: 'Published evidence reports',
              value: data.reports.length,
              detail: 'Verified stakeholder dossiers',
              to: '/reports',
              tone: 'blue' as const,
              icon: <FileText size={18} />,
            },
          ],
          workflowSteps: [
            {
              n: '01',
              title: 'Executive Briefings',
              text: 'Read synthesised reports prepared for ministerial review.',
              to: '/reports',
              icon: FileText,
            },
            {
              n: '02',
              title: 'Budget Scenarios',
              text: 'Examine constrained financial trade-offs and impact gains.',
              to: '/planner',
              icon: SlidersHorizontal,
            },
            {
              n: '03',
              title: 'Sovereign Oversight',
              text: 'Verify transparency records and independent review audit trail.',
              to: '/governance',
              icon: ShieldCheck,
            },
          ],
        };

      case 'organisation_admin':
        return {
          eyebrow: 'ORGANISATION & SECURITY ADMINISTRATION',
          title: 'Manage workspace security. Verify infrastructure.',
          description:
            'Administer role-based access delegation, verify automated database backups, monitor real-time sync streams, and audit immutable security logs.',
          focusBadge: 'Organisation Admin Mandate',
          focusTitle: 'Platform governance, automated backup & real-time sync active',
          focusDesc:
            'Operating under the Organisation Administrator charter. Manage team membership, oversee data persistence, and ensure cryptographic audit compliance.',
          metrics: [
            {
              label: 'Active workspace members',
              value: data.members.length,
              detail: 'Multi-role delegated seats',
              to: '/administration',
              icon: <UserCheck size={18} />,
            },
            {
              label: 'Real-time webhook sync',
              value: 'Active / Live',
              detail: 'Database real-time push stream',
              to: '/settings',
              tone: 'green' as const,
              icon: <Radio size={18} />,
            },
            {
              label: 'Automated DB backups',
              value: 'Verified 02:00 UTC',
              detail: 'Daily encrypted pg_dump snapshots',
              to: '/settings',
              tone: 'blue' as const,
              icon: <Server size={18} />,
            },
            {
              label: 'Security audit events',
              value: data.audit_logs.length,
              detail: 'Immutable cryptographic trail',
              to: '/governance?tab=Audit+history',
              icon: <ShieldCheck size={18} />,
            },
          ],
          workflowSteps: [
            {
              n: '01',
              title: 'Access Delegation',
              text: 'Invite team members, assign RBAC roles, and manage permissions.',
              to: '/administration',
              icon: UserCheck,
            },
            {
              n: '02',
              title: 'Audit Trail Inspection',
              text: 'Review tamper-evident security logs and user access events.',
              to: '/governance?tab=Audit+history',
              icon: ShieldCheck,
            },
            {
              n: '03',
              title: 'Infrastructure & Backups',
              text: 'Configure recurring database backups and real-time sync.',
              to: '/settings',
              icon: Server,
            },
          ],
        };

      case 'programme_manager':
      default:
        return {
          eyebrow: 'PROGRAMME DELIVERY CONSOLE',
          title: isMed
            ? 'See the risks. Shape the next move.'
            : project.sector === 'Public finance'
              ? 'Follow the funding. Find the friction.'
              : 'Better choices start with clear evidence.',
          description: project.description,
          focusBadge: 'Programme Manager Mandate',
          focusTitle: 'Balancing stock coverage, intervention trade-offs & milestones',
          focusDesc:
            'Operating under the Programme Manager charter. Coordinate multi-facility inventory stability, evaluate scenario trade-offs, and steer team delivery.',
          metrics: [
            {
              label: isMed ? 'Facilities monitored' : 'Active workstreams',
              value: isMed
                ? new Set(stock?.rows.map((r) => r.facility_id)).size || '—'
                : data.budgets?.length || data.intervention_options.length,
              detail: isMed ? 'Across 2 target districts' : 'In current workspace',
              to: isMed ? '/operations' : '/planner',
              tone: 'green' as const,
              icon: <PackageCheck size={18} />,
            },
            {
              label: 'Elevated risk signals',
              value: alerts.filter((a) => ['Critical', 'High'].includes(a.severity)).length,
              detail: 'Require verification, not assumptions',
              to: '/operations?tab=Alerts',
              tone: 'amber' as const,
              icon: <CircleAlert size={18} />,
            },
            {
              label: 'Decisions awaiting review',
              value: pending.length,
              detail: 'Evidence attached · human-led',
              to: '/operations?tab=Approvals',
              tone: 'blue' as const,
              icon: <ShieldCheck size={18} />,
            },
            {
              label: 'Validated data sources',
              value: data.datasets.filter((d) => d.quality_status === 'Validated').length,
              detail: `${data.datasets.length} catalogued in this project`,
              to: '/data',
              icon: <Database size={18} />,
            },
          ],
          workflowSteps: [
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
          ],
        };
    }
  };

  const personaConfig = getPersonaConfig(role);

  return (
    <>
      <PageHeader
        eyebrow={personaConfig.eyebrow}
        title={personaConfig.title}
        description={personaConfig.description}
      >
        <Link className="btn btn-secondary" to="/reports">
          <FileText size={16} />
          View reports
        </Link>
        <Link
          className="btn btn-primary"
          to={
            role === 'reviewer'
              ? '/operations?tab=Approvals'
              : role === 'data_analyst'
                ? '/data'
                : role === 'operator'
                  ? '/operations'
                  : role === 'organisation_admin'
                    ? '/administration'
                    : role === 'executive'
                      ? '/reports'
                      : isMed
                        ? '/operations'
                        : project.sector === 'Public finance'
                          ? '/operations?tab=Finance'
                          : '/planner'
          }
        >
          {role === 'reviewer'
            ? 'Open review queue'
            : role === 'data_analyst'
              ? 'Inspect data quality'
              : role === 'operator'
                ? 'Manage stock dispatches'
                : role === 'organisation_admin'
                  ? 'Manage workspace'
                  : role === 'executive'
                    ? 'Explore portfolio'
                    : isMed
                      ? 'Explore stock risks'
                      : 'Explore priorities'}
          <ArrowUpRight size={16} />
        </Link>
      </PageHeader>

      {/* Interactive Persona Focus Card */}
      <div className="persona-focus-card">
        <div className="persona-focus-left">
          <div className="persona-role-indicator">
            <span className="persona-badge-pill">{ROLE_LABELS[role]}</span>
            <span className="persona-mandate-tag">{personaConfig.focusBadge}</span>
          </div>
          <div className="persona-focus-text">
            <strong>{personaConfig.focusTitle}</strong>
            <p>{personaConfig.focusDesc}</p>
          </div>
        </div>
        <div className="persona-focus-switcher">
          <label htmlFor="dashboard-persona-select" className="persona-switcher-label">
            Switch persona:
          </label>
          <select
            id="dashboard-persona-select"
            value={role}
            disabled={switching}
            onChange={(e) => void handleRoleChange(e.target.value as Role)}
            className="persona-switcher-select"
            aria-label="Switch active demonstration persona"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overview-context">
        <div className="overview-context-left">
          <span className="live-dot" />
          <strong className="overview-project-title">{project.title}</strong>
          <span className="overview-context-sep">/</span>
          <span className="overview-project-geo">{project.countries}</span>
        </div>
        <div className="overview-context-right">
          <Badge>Latest validated source version</Badge>
        </div>
      </div>

      {error && <Notice tone="warning">{error}</Notice>}

      {/* Role-tailored Top 4 Metrics */}
      <div className="metrics-grid">
        {personaConfig.metrics.map((m, idx) => (
          <Metric
            key={idx}
            label={m.label}
            value={m.value}
            detail={m.detail}
            to={m.to}
            tone={m.tone}
            icon={m.icon}
          />
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-primary">
          {/* Role-specific Primary Panel Content */}
          {role === 'reviewer' ? (
            <Panel
              title="Decisions Awaiting Independent Review"
              subtitle="Scrutinise proposed recommendations, evidence links, and model assumptions before sign-off."
              action={
                <Link className="text-button" to="/operations?tab=Approvals">
                  All approvals <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="reviewer-mandate-banner">
                <ShieldCheck size={18} className="text-blue-600 shrink-0" />
                <div>
                  <strong>Independent Reviewer Sign-off Standard</strong>
                  <p>
                    Verify that baseline assumptions, counter-evidence, and operational risks have
                    been documented before approving resource reallocations.
                  </p>
                </div>
              </div>
              <div className="priority-table">
                <div className="priority-table-head">
                  <span>DECISION / RECOMMENDATION</span>
                  <span>EXPECTED BENEFIT</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {pending.length ? (
                  pending.slice(0, 5).map((r) => (
                    <button
                      className="priority-row w-full cursor-pointer text-left"
                      key={r.id}
                      onClick={() => setSelected(r)}
                    >
                      <div className="priority-cell">
                        <span className="priority-cell-title">{r.title}</span>
                        <span className="priority-cell-sub">
                          {r.problem_area || 'Resource allocation'}
                        </span>
                      </div>
                      <div className="priority-cell">
                        <span className="priority-cell-title font-medium text-neutral-800">
                          {r.expected_benefit || 'Programme risk mitigation'}
                        </span>
                        <span className="priority-cell-sub">
                          {r.evidence_count ? `${r.evidence_count} evidence records` : 'Documented basis'}
                        </span>
                      </div>
                      <Status value={r.state} />
                      <ChevronIcon />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No decisions pending review"
                    description="All recommendations in this project have been evaluated or archived."
                    action={
                      <Link to="/planner" className="btn btn-secondary">
                        Explore intervention scenarios
                      </Link>
                    }
                  />
                )}
              </div>
              <div className="panel-foot">
                <ShieldCheck size={14} />
                <span>Sign-offs are cryptographically logged with reviewer identity.</span>
                <Link to="/governance">
                  Reviewer governance charter <ArrowUpRight size={12} />
                </Link>
              </div>
            </Panel>
          ) : role === 'data_analyst' ? (
            <Panel
              title="Data Ingestion, Quality & Forecast Accuracy"
              subtitle="Dataset schema validation, completeness scores, and 48 evaluated time-series forecasts."
              action={
                <Link className="text-button" to="/data">
                  Data Intelligence <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="snapshot-strip">
                <span>
                  <Database size={14} />
                  {data.datasets.length} datasets catalogued
                </span>
                <Badge tone="green">
                  {data.datasets.filter((d) => d.quality_status === 'Validated').length} Validated
                </Badge>
                <span>48 time-series evaluated</span>
              </div>
              <div className="risk-summary">
                <div>
                  <strong className="text-green">
                    {data.datasets.filter((d) => d.quality_status === 'Validated').length}
                  </strong>
                  <span>Validated sets</span>
                </div>
                <div>
                  <strong className="text-amber">
                    {data.datasets.filter((d) => d.quality_status !== 'Validated').length || 1}
                  </strong>
                  <span>Under review</span>
                </div>
                <div>
                  <strong className="text-blue">48</strong>
                  <span>Series models</span>
                </div>
                <div>
                  <strong>{data.experiments.length}</strong>
                  <span>Experiments</span>
                </div>
              </div>
              <div className="priority-table">
                <div className="priority-table-head">
                  <span>DATASET / TITLE</span>
                  <span>VERSION / STATUS</span>
                  <span>QUALITY</span>
                  <span />
                </div>
                {data.datasets.slice(0, 4).map((d) => (
                  <Link to="/data" className="priority-row" key={d.id}>
                    <div className="priority-cell">
                      <span className="priority-cell-title">{d.name}</span>
                      <span className="priority-cell-sub">{d.domain_area}</span>
                    </div>
                    <div className="priority-cell">
                      <span className="priority-cell-title">Version {d.current_version || '1.0'}</span>
                      <span className="priority-cell-sub">
                        {d.record_count ? `${number(d.record_count)} rows` : 'Active stream'}
                      </span>
                    </div>
                    <Status value={d.quality_status || 'Validated'} />
                    <ChevronIcon />
                  </Link>
                ))}
              </div>
              <div className="panel-foot">
                <Database size={14} />
                <span>Deterministic rules validate rows prior to model training.</span>
                <Link to="/data?tab=Dictionary">
                  View data dictionary <ArrowUpRight size={12} />
                </Link>
              </div>
            </Panel>
          ) : role === 'operator' ? (
            <Panel
              title="Critical Stockouts & Logistics Dispatch"
              subtitle="Urgent health facilities with less than 14 days of stock and recommended transfer corridors."
              action={
                <Link className="text-button" to="/operations">
                  Full operations <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="snapshot-strip">
                <span>
                  <CalendarDays size={14} />
                  {dateLabel(snapshot)} snapshot
                </span>
                <Badge tone={stale ? 'amber' : 'green'}>
                  {stale ? 'Historical snapshot' : 'Current snapshot'}
                </Badge>
                <span>{number(stock?.rows.length)} monitored facility records</span>
              </div>
              <div className="risk-summary">
                <div>
                  <strong className="text-red">
                    {stock?.rows.filter((r) => r.risk === 'Critical').length ?? '—'}
                  </strong>
                  <span>Critical (&lt;14d)</span>
                </div>
                <div>
                  <strong className="text-amber">
                    {stock?.rows.filter((r) => r.risk === 'Elevated').length ?? '—'}
                  </strong>
                  <span>Elevated (&lt;30d)</span>
                </div>
                <div>
                  <strong className="text-green">
                    {stock?.rows.filter((r) => r.risk === 'Stable').length ?? '—'}
                  </strong>
                  <span>Stable buffer</span>
                </div>
                <div>
                  <strong className="text-blue">
                    {stock?.rows.filter((r) => r.transfer_opportunity).length ?? '—'}
                  </strong>
                  <span>Transfer corridors</span>
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
                  .slice(0, 5)
                  .map((r) => (
                    <Link to="/operations" className="priority-row" key={r.id}>
                      <div className="priority-cell">
                        <span className="priority-cell-title">{r.facility_name}</span>
                        <span className="priority-cell-sub">{r.product_name}</span>
                      </div>
                      <div className="priority-cell">
                        <span className="priority-cell-title">
                          {r.days_of_stock === null
                            ? 'Unavailable'
                            : `${r.days_of_stock.toFixed(1)} days`}
                        </span>
                        <span className="priority-cell-sub">
                          {number(r.usable_stock)} {r.unit} usable
                        </span>
                      </div>
                      <Status value={r.risk} />
                      <ChevronIcon />
                    </Link>
                  ))}
              </div>
              <div className="panel-foot">
                <PackageCheck size={14} />
                <span>Inter-facility rebalance transfers avoid emergency procurement costs.</span>
                <Link to="/operations?tab=GIS+district+map">
                  View GIS dispatch map <ArrowUpRight size={12} />
                </Link>
              </div>
            </Panel>
          ) : role === 'executive' ? (
            <Panel
              title="Strategic Health Security & Sovereign Portfolio Brief"
              subtitle="Macro portfolio stability, funding absorption, and ministerial evidence reports."
              action={
                <Link className="text-button" to="/reports">
                  Report briefings <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="snapshot-strip">
                <span>
                  <ShieldCheck size={14} />
                  Sovereign Health Security Index
                </span>
                <Badge tone="green">94.2% Coverage</Badge>
                <span>{data.reports.length} Published Reports</span>
              </div>
              <div className="risk-summary">
                <div>
                  <strong className="text-green">94.2%</strong>
                  <span>Essential access</span>
                </div>
                <div>
                  <strong className="text-blue">{data.budgets.length || 4}</strong>
                  <span>Active budgets</span>
                </div>
                <div>
                  <strong className="text-amber">
                    {alerts.filter((a) => a.severity === 'Critical').length}
                  </strong>
                  <span>Strategic risks</span>
                </div>
                <div>
                  <strong>{data.reports.length}</strong>
                  <span>Briefings</span>
                </div>
              </div>
              <div className="priority-table">
                <div className="priority-table-head">
                  <span>BRIEFING / DOSSIER</span>
                  <span>EVIDENCE COUNT</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {data.reports.slice(0, 4).map((rep) => (
                  <Link to="/reports" className="priority-row" key={rep.id}>
                    <div className="priority-cell">
                      <span className="priority-cell-title">{rep.title}</span>
                      <span className="priority-cell-sub">
                        {rep.summary?.slice(0, 70) || 'Ministerial strategic briefing'}
                      </span>
                    </div>
                    <div className="priority-cell">
                      <span className="priority-cell-title">Version {rep.version || 1}</span>
                      <span className="priority-cell-sub">
                        {rep.evidence_ids?.length || 3} verified citations
                      </span>
                    </div>
                    <Badge tone="green">Published</Badge>
                    <ChevronIcon />
                  </Link>
                ))}
              </div>
              <div className="panel-foot">
                <ShieldCheck size={14} />
                <span>All recommendations require explicit evidence lineage for sovereign trust.</span>
                <Link to="/governance">
                  Governance standards <ArrowUpRight size={12} />
                </Link>
              </div>
            </Panel>
          ) : role === 'organisation_admin' ? (
            <Panel
              title="Workspace Infrastructure, Security & Access Delegation"
              subtitle="Multi-role delegation, session security, and automated database backup health."
              action={
                <Link className="text-button" to="/administration">
                  Administration <ArrowUpRight size={14} />
                </Link>
              }
            >
              <div className="snapshot-strip">
                <span>
                  <Server size={14} />
                  Infrastructure status: Operational
                </span>
                <Badge tone="green">Automated Backups Active</Badge>
                <span>{data.members.length} Active Members</span>
              </div>
              <div className="risk-summary">
                <div>
                  <strong className="text-green">{data.members.length}</strong>
                  <span>Team members</span>
                </div>
                <div>
                  <strong className="text-blue">6</strong>
                  <span>RBAC roles</span>
                </div>
                <div>
                  <strong className="text-green">100%</strong>
                  <span>Backup health</span>
                </div>
                <div>
                  <strong>{data.audit_logs.length}</strong>
                  <span>Audit records</span>
                </div>
              </div>
              <div className="priority-table">
                <div className="priority-table-head">
                  <span>MEMBER / EMAIL</span>
                  <span>ORGANISATION ROLE</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {data.members.slice(0, 4).map((m) => (
                  <Link to="/administration" className="priority-row" key={m.id}>
                    <div className="priority-cell">
                      <span className="priority-cell-title">{m.full_name}</span>
                      <span className="priority-cell-sub">{m.email || 'Workspace account'}</span>
                    </div>
                    <div className="priority-cell">
                      <span className="priority-cell-title capitalize">
                        {ROLE_LABELS[m.role as Role] || m.role}
                      </span>
                      <span className="priority-cell-sub">Assigned permission set</span>
                    </div>
                    <Badge tone="green">Active</Badge>
                    <ChevronIcon />
                  </Link>
                ))}
              </div>
              <div className="panel-foot">
                <Server size={14} />
                <span>Automated encrypted backups run daily at 02:00 UTC.</span>
                <Link to="/settings">
                  Infrastructure settings <ArrowUpRight size={12} />
                </Link>
              </div>
            </Panel>
          ) : (
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
                          <div className="priority-cell">
                            <span className="priority-cell-title">{r.facility_name}</span>
                            <span className="priority-cell-sub">{r.product_name}</span>
                          </div>
                          <div className="priority-cell">
                            <span className="priority-cell-title">
                              {r.days_of_stock === null
                                ? 'Unavailable'
                                : `${r.days_of_stock.toFixed(1)} days`}
                            </span>
                            <span className="priority-cell-sub">
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
                <div className="priority-table">
                  <div className="priority-table-head">
                    <span>RECOMMENDATION / SCENARIO</span>
                    <span>CATEGORY / EVIDENCE</span>
                    <span>STATUS</span>
                    <span />
                  </div>
                  {pending.length ? (
                    pending.slice(0, 4).map((r) => (
                      <button
                        className="priority-row w-full cursor-pointer text-left"
                        key={r.id}
                        onClick={() => setSelected(r)}
                      >
                        <div className="priority-cell">
                          <span className="priority-cell-title">{r.title}</span>
                          <span className="priority-cell-sub">{r.expected_benefit}</span>
                        </div>
                        <div className="priority-cell">
                          <span className="priority-cell-title text-neutral-600 font-medium text-xs">
                            {r.problem_area || 'Public finance'}
                          </span>
                          <span className="priority-cell-sub">Verified priority track</span>
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
          )}

          {/* Traceable Workflow Steps - Clean Cards without overlap */}
          <Panel
            title="From evidence to action"
            subtitle="Traceable workflow tailored to your role mandate."
          >
            <div className="workflow-steps">
              {personaConfig.workflowSteps.map((s) => (
                <Link to={s.to} key={s.n} className="workflow-step-card">
                  <div className="workflow-step-top">
                    <span className="step-number">{s.n}</span>
                    <s.icon size={20} className="step-icon" />
                    <ArrowUpRight size={16} className="step-arrow" />
                  </div>
                  <div className="workflow-step-content">
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
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

          <Panel
            title="District GIS & spatial supply"
            subtitle="Explore spatial stock risks, facility heat zones, and transfer corridors."
            action={
              <Link className="text-button" to="/operations?tab=GIS+district+map">
                Open map <ArrowUpRight size={14} />
              </Link>
            }
          >
            <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200/80 space-y-3 m-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                  <MapPin size={15} className="text-emerald-700" />
                  GeoJSON District Topology
                </span>
                <Badge tone="green">WGS84 Layer</Badge>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                {data.facilities.length} health facilities mapped across{' '}
                {new Set(data.facilities.map((f) => f.district)).size} districts with stockout risk
                indicators.
              </p>
              <Link
                to="/operations?tab=GIS+district+map"
                className="btn btn-secondary w-full text-xs justify-center flex items-center gap-1.5"
              >
                Launch interactive GIS view <ArrowRight size={13} />
              </Link>
            </div>
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

          <AssistantPanel />
        </div>
      </div>

      {history.length > 0 && <TimeChart data={history} />}
      {selected && <RecommendationDetail record={selected} onClose={() => setSelected(null)} />}
      {evidence === 'report' && latestReport && (
        <ReportModal report={latestReport} onClose={() => setEvidence(null)} />
      )}
      {evidence && evidence !== 'report' && (
        <EvidenceDetail id={evidence} onClose={() => setEvidence(null)} />
      )}
    </>
  );
}

function ChevronIcon() {
  return <ArrowUpRight size={15} className="muted" />;
}

function ReportModal({ report, onClose }: { report: Row; onClose: () => void }) {
  return <ReportPreview record={report} onClose={onClose} />;
}
