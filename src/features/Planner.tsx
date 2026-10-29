import { useState } from 'react';
import {
  Plus,
  SlidersHorizontal,
  ArrowRight,
  Download,
  Play,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import { useStore, useAction, type Row } from '../lib/store';
import { api, exportCSV } from '../lib/api';
import {
  PageHeader,
  Panel,
  Tabs,
  Table,
  Button,
  Badge,
  Status,
  Notice,
  Modal,
  KeyValue,
  Empty,
} from '../components/ui';
import { RecordForm, RecommendationDetail } from '../components/workflow';
import { ComparisonChart } from '../components/charts';
import { money, number } from '../../shared/domain';
import { optimise, type Option, type Constraints } from '../../shared/analytics';
export function Planner() {
  const { data, allow } = useStore(),
    action = useAction();
  const [tab, setTab] = useState('Scenarios'),
    [create, setCreate] = useState(false),
    [option, setOption] = useState<Row | null | undefined>(undefined),
    [selected, setSelected] = useState<Row | null>(null),
    [review, setReview] = useState<Row | null>(null),
    [busy, setBusy] = useState('');
  const scenarios = data?.optimisation_scenarios || [],
    options = data?.intervention_options || [];
  return (
    <>
      <PageHeader
        eyebrow="HEALTH INTERVENTION PRIORITISATION"
        title="Make the trade-offs visible."
        description="Compare feasible intervention packages under budget, delivery, geographic, and equity constraints."
      >
        <Button variant="secondary" onClick={() => setOption(null)} disabled={!allow('manage')}>
          <Plus size={16} />
          Intervention option
        </Button>
        <Button onClick={() => setCreate(true)} disabled={!allow('manage')}>
          <SlidersHorizontal size={16} />
          New scenario
        </Button>
      </PageHeader>
      <Notice tone="warning">
        All costs and reach estimates are synthetic assumptions. Package reach may overlap.
        Optimisation supports a policy discussion; it does not make a policy decision.
      </Notice>
      <Tabs
        items={['Scenarios', 'Intervention catalogue', 'Sensitivity analysis', 'Method & evidence']}
        value={tab}
        onChange={setTab}
      />
      {tab === 'Scenarios' && (
        <>
          <div className="scenario-grid">
            {scenarios.map((s, i) => {
              const r = s.result;
              return (
                <section className={`scenario-card ${i === 1 ? 'featured' : ''}`} key={s.id}>
                  <div className="scenario-card-top">
                    <span className="eyebrow">SCENARIO {String(i + 1).padStart(2, '0')}</span>
                    <Status value={s.status} />
                  </div>
                  <h2>{s.name}</h2>
                  <div className="scenario-budget">
                    {money(Number(s.budget_cents) / 100, s.currency)}
                    <span>budget ceiling</span>
                  </div>
                  <div className="scenario-result">
                    <span>Assumed people reached</span>
                    <strong>{r.feasible ? number(r.expected_outcome) : 'Infeasible'}</strong>
                  </div>
                  <div className="budget-meter">
                    <span
                      style={{
                        width: r.feasible
                          ? Math.min(100, (r.total_cost_cents / Number(s.budget_cents)) * 100) + '%'
                          : '0%',
                      }}
                    />
                  </div>
                  <div className="scenario-cost">
                    <span>{money(r.total_cost_cents / 100, s.currency)} allocated</span>
                    <span>{r.selected?.length || 0} packages</span>
                  </div>
                  <ul>
                    {s.constraints.required_geographies.map((g: string) => (
                      <li key={g}>
                        <CheckCircle2 size={14} />
                        {g} coverage
                      </li>
                    ))}
                    <li>
                      <CheckCircle2 size={14} />
                      {s.constraints.equity_minimum} rural packages minimum
                    </li>
                    <li>
                      <CheckCircle2 size={14} />
                      {s.constraints.max_months}-month delivery limit
                    </li>
                  </ul>
                  {!r.feasible && <Notice tone="warning">{r.reasons?.join(' ')}</Notice>}
                  <Button
                    variant={i === 1 ? 'primary' : 'secondary'}
                    className="w-full"
                    onClick={() => setSelected(s)}
                  >
                    Inspect allocation <ArrowRight size={15} />
                  </Button>
                </section>
              );
            })}
          </div>
          {!scenarios.length && (
            <Empty
              title="Define your first budget scenario"
              description="Add intervention options, then set explicit constraints and run the exact allocation solver."
              action={
                <Button onClick={() => setCreate(true)} disabled={!allow('manage')}>
                  Create scenario
                </Button>
              }
            />
          )}
          <Panel
            title="Compare scenario outcomes"
            subtitle="The same assumption catalogue supports each scenario. Snapshots preserve the inputs used at execution."
          >
            <ComparisonChart
              data={scenarios.map((s) => ({ name: s.name, value: s.result.expected_outcome || 0 }))}
            />
          </Panel>
        </>
      )}
      {tab === 'Intervention catalogue' && (
        <Panel
          title="Intervention package catalogue"
          subtitle="Discrete packages, explicit delivery capacity, and clearly classified evidence."
          action={
            <Button
              variant="secondary"
              onClick={() => exportCSV('intervention-options.csv', options)}
            >
              <Download size={15} />
              Export
            </Button>
          }
        >
          <Table
            rows={options}
            label="Intervention options"
            columns={[
              {
                key: 'name',
                label: 'Intervention',
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.name}</strong>
                    <span>{r.target_population}</span>
                  </div>
                ),
              },
              { key: 'geography', label: 'Geography' },
              {
                key: 'cost_cents',
                label: 'Package cost',
                render: (r) => money(Number(r.cost_cents) / 100, r.currency),
              },
              {
                key: 'expected_outcome',
                label: 'Assumed reach',
                render: (r) => number(r.expected_outcome),
              },
              { key: 'implementation_months', label: 'Months' },
              {
                key: 'evidence_quality',
                label: 'Evidence',
                render: () => <Badge tone="amber">Assumption</Badge>,
              },
            ]}
            onRowClick={(r) => setOption(r)}
          />
        </Panel>
      )}
      {tab === 'Sensitivity analysis' && (
        <Panel
          title="How does the allocation change with the budget?"
          subtitle="Exact re-optimisation at ±20% of each saved budget, holding package assumptions and constraints fixed."
        >
          <div className="p-5 stack">
            {scenarios.map((s) => {
              const rows = [0.8, 1, 1.2].map((m) => {
                const budget = Math.round(Number(s.budget_cents) * m);
                let r: ReturnType<typeof optimise> | null = null,
                  error = '';
                try {
                  r = optimise(
                    s.option_snapshot.map((o: Row) => ({
                      ...o,
                      cost_cents: Number(o.cost_cents),
                    })) as Option[],
                    budget,
                    s.currency,
                    s.constraints as Constraints,
                  );
                } catch (e) {
                  error = (e as Error).message;
                }
                return {
                  id: s.id + m,
                  scenario: s.name,
                  budget,
                  change: m === 1 ? 'Base' : m < 1 ? '−20%' : '+20%',
                  outcome: r?.expected_outcome ?? 'Error',
                  packages: r?.selected.length ?? 0,
                  feasible: r?.feasible ? 'Feasible' : 'Infeasible',
                  error,
                };
              });
              return (
                <div key={s.id}>
                  <h3 className="mb-3">{s.name}</h3>
                  <Table
                    rows={rows}
                    columns={[
                      { key: 'change', label: 'Budget change' },
                      { key: 'budget', label: 'Budget', render: (r) => money(r.budget / 100) },
                      {
                        key: 'outcome',
                        label: 'Assumed reach',
                        render: (r) => number(Number(r.outcome)),
                      },
                      { key: 'packages', label: 'Packages' },
                      {
                        key: 'feasible',
                        label: 'Feasibility',
                        render: (r) => <Status value={r.feasible} />,
                      },
                    ]}
                  />
                </div>
              );
            })}
            {!scenarios.length && (
              <Empty
                title="Save a scenario first"
                description="Sensitivity analysis uses its immutable option snapshot."
              />
            )}
            <Notice>
              These are newly computed deterministic comparisons, not measured programme outcomes.
              No uncertainty in costs or effects is implied.
            </Notice>
          </div>
        </Panel>
      )}
      {tab === 'Method & evidence' && (
        <div className="two-col">
          <Panel title="The objective and constraints">
            <div className="p-5 method-copy">
              <span className="method-icon">
                <Scale size={28} />
              </span>
              <h3>Maximise assumed reach within feasible delivery.</h3>
              <p>
                The solver exhaustively evaluates all binary package combinations (up to 16
                options), filters violations, and maximises total expected reach. Equal-reach
                solutions prefer lower cost.
              </p>
              <ul className="detail-list">
                <li>Budget is a hard ceiling in integer currency minor units.</li>
                <li>Required geographic coverage must be represented.</li>
                <li>
                  A minimum number of rural packages implements the explicit equity constraint.
                </li>
                <li>Every package must fit the delivery window and capacity.</li>
                <li>Selected dependencies must also be selected; cycles are rejected.</li>
              </ul>
              <Badge>allocation-1.0 · exact enumeration</Badge>
            </div>
          </Panel>
          <Panel title="What this model cannot tell you">
            <div className="p-5 stack">
              <Notice tone="warning">
                Reach is not a causal health effect. The synthetic assumptions have not been
                validated against real programmes.
              </Notice>
              <h4>Important unresolved questions</h4>
              <ul className="detail-list">
                <li>Do target populations overlap across packages?</li>
                <li>Are unit costs complete and locally verified?</li>
                <li>Can staff and supply systems actually deliver the package?</li>
                <li>Which groups might be excluded by the chosen constraints?</li>
              </ul>
              <h4>Before implementation</h4>
              <p className="muted">
                Replace assumptions with reviewed evidence, assess distributional impacts, obtain
                authorised approval, and track actual outcomes.
              </p>
            </div>
          </Panel>
        </div>
      )}
      {create && <ScenarioForm onClose={() => setCreate(false)} />}{' '}
      {option !== undefined && (
        <RecordForm
          title={option ? 'Edit intervention assumption' : 'Add intervention package'}
          table="intervention_options"
          initial={option || undefined}
          fields={[
            { name: 'name', label: 'Intervention name', required: true },
            { name: 'target_population', label: 'Target population', required: true },
            {
              name: 'geography',
              label: 'Geography',
              type: 'select',
              options: ['Northern Zone', 'Central Zone'],
            },
            {
              name: 'cost_cents',
              label: 'Total cost (USD minor units / cents)',
              type: 'number',
              required: true,
              hint: 'Example: 3500000 cents = USD 35,000.',
            },
            { name: 'unit_cost_cents', label: 'Unit cost (cents)', type: 'number' },
            {
              name: 'expected_outcome',
              label: 'Expected people reached (assumption)',
              type: 'number',
              required: true,
            },
            {
              name: 'capacity',
              label: 'Delivery capacity (people)',
              type: 'number',
              required: true,
            },
            {
              name: 'implementation_months',
              label: 'Implementation period (months)',
              type: 'number',
              required: true,
            },
            {
              name: 'equity_group',
              label: 'Equity group',
              type: 'select',
              options: ['Rural', 'All facilities', 'Facility staff'],
            },
            { name: 'currency', label: 'Currency', type: 'select', options: ['USD'] },
            { name: 'outcome_unit', label: 'Outcome unit', required: true },
            {
              name: 'evidence_source',
              label: 'Evidence source / assumption statement',
              type: 'textarea',
              required: true,
            },
            {
              name: 'evidence_quality',
              label: 'Evidence quality',
              type: 'select',
              options: ['Unverified demonstration assumption', 'Reviewed programme evidence'],
            },
            { name: 'constraints', label: 'Operational constraints', type: 'textarea' },
            { name: 'dependencies', label: 'Dependency option IDs (JSON array)', type: 'json' },
          ]}
          onClose={() => setOption(undefined)}
        />
      )}
      {selected && (
        <Modal
          title={selected.name + ' · allocation detail'}
          wide
          onClose={() => setSelected(null)}
        >
          <KeyValue
            data={{
              Budget: money(Number(selected.budget_cents) / 100),
              Allocated: money(selected.result.total_cost_cents / 100),
              Unallocated: money(selected.result.remaining_budget_cents / 100),
              Feasibility: selected.result.feasible ? 'Feasible' : 'Infeasible',
              'Combinations evaluated': number(selected.result.evaluated_combinations),
              'Feasible combinations': number(selected.result.feasible_combinations),
            }}
          />
          <h4>Selected packages and rationale</h4>
          <Table
            rows={selected.option_snapshot.filter((o: Row) =>
              selected.result.selected.includes(o.id),
            )}
            columns={[
              { key: 'name', label: 'Selected package' },
              {
                key: 'cost_cents',
                label: 'Cost',
                render: (r) => money(Number(r.cost_cents) / 100),
              },
              { key: 'expected_outcome', label: 'Assumed reach' },
              { key: 'geography', label: 'Coverage' },
              { key: 'equity_group', label: 'Equity group' },
            ]}
          />
          <Notice>
            {selected.result.objective} {selected.result.reasons?.join(' ')}
          </Notice>
          <ul className="detail-list">
            {selected.result.assumptions?.map((a: string) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="modal-actions">
            <Button
              variant="secondary"
              busy={busy === selected.id}
              disabled={!allow('data')}
              onClick={async () => {
                setBusy(selected.id);
                await action(
                  () => api('/scenarios/' + selected.id + '/run', { body: {} }),
                  'Scenario recomputed and evidence version saved',
                );
                setBusy('');
                setSelected(null);
              }}
            >
              <Play size={15} />
              Recompute
            </Button>
            <Button
              onClick={() => {
                const r = data?.recommendations.find((r) => r.id === selected.recommendation_id);
                setSelected(null);
                if (r) setReview(r);
              }}
            >
              Review recommendation <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
      {review && <RecommendationDetail record={review} onClose={() => setReview(null)} />}
    </>
  );
}
function ScenarioForm({ onClose }: { onClose: () => void }) {
  const { data } = useStore(),
    action = useAction();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create a constrained budget scenario" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const ok = await action(
            () =>
              api('/projects/' + data!.project.id + '/scenarios', {
                body: {
                  name: f.get('name'),
                  budget: Number(f.get('budget')),
                  currency: 'USD',
                  equity_minimum: Number(f.get('equity_minimum')),
                  max_months: Number(f.get('max_months')),
                  required_geographies: f.getAll('geography'),
                },
              }),
            'Scenario saved, solved, and linked to a review recommendation',
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <label className="form-field">
          <span>Scenario name *</span>
          <input name="name" required maxLength={160} />
        </label>
        <label className="form-field">
          <span>Budget ceiling (USD) *</span>
          <input
            name="budget"
            type="number"
            min="0"
            max="100000000"
            step="100"
            required
            defaultValue="160000"
          />
        </label>
        <div className="two-col">
          <label className="form-field">
            <span>Minimum rural packages</span>
            <input name="equity_minimum" type="number" min="0" max="16" defaultValue="2" required />
          </label>
          <label className="form-field">
            <span>Maximum delivery months</span>
            <input name="max_months" type="number" min="1" max="24" defaultValue="4" required />
          </label>
        </div>
        <fieldset className="checkbox-field">
          <legend>Required geographic coverage</legend>
          {['Northern Zone', 'Central Zone'].map((g) => (
            <label key={g}>
              <input type="checkbox" name="geography" value={g} defaultChecked />
              {g}
            </label>
          ))}
        </fieldset>
        <Notice>
          Solver results are saved with an option snapshot and linked to a draft recommendation. No
          allocation executes automatically.
        </Notice>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy}>
            <Play size={15} />
            Save & optimise
          </Button>
        </div>
      </form>
    </Modal>
  );
}
