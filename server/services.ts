/* eslint-disable @typescript-eslint/no-explicit-any -- Raw PostgreSQL rows are converted at domain boundaries. */
import type { StockRow } from '../shared/domain';
type Transfer = NonNullable<StockRow['transfer_opportunity']>;
import { createHash } from 'node:crypto';
import {
  evaluateSeries,
  metrics,
  movingAverage,
  exponentialSmooth,
  aggregateFinance,
  optimise,
  daysOfStock,
  stockRisk,
  transferQuantity,
  type Option,
  type Constraints,
} from '../shared/analytics';
import { AS_OF } from '../shared/domain';
import { audit, one, type Client } from './db';
export const json = (v: unknown) => JSON.stringify(v);
export async function context(c: Client, projectId: string) {
  const p = await one(c, 'select * from projects where id=$1', [projectId]);
  return {
    project: p,
    org: String(p.organisation_id),
    actor: (await one(c, 'select app_uid() as id')).id as string,
  };
}
export async function latestVersion(c: Client, project: string, kind: string) {
  return (
    await c.query(
      `select dv.*,d.name,d.sensitivity from dataset_versions dv join datasets d on d.id=dv.dataset_id where d.project_id=$1 and d.kind=$2 order by dv.created_at desc,dv.version desc limit 1`,
      [project, kind],
    )
  ).rows[0];
}
export async function sources(c: Client, project: string, kinds: string[]) {
  const result: any[] = [];
  for (const kind of kinds) {
    const v = await latestVersion(c, project, kind);
    if (v) result.push({ dataset_id: v.dataset_id, version_id: v.id, version: v.version });
  }
  return result;
}
export async function saveEvidence(
  c: Client,
  project: string,
  question: string,
  method: string,
  result: unknown,
  kinds: string[],
  period: string,
  assumptions: string[],
  limitations: string[],
  runId: string | null = null,
) {
  const { org, actor } = await context(c, project);
  const source = await sources(c, project, kinds);
  const e = await one(
    c,
    `insert into evidence_records(organisation_id,project_id,created_by,question,method,method_version,result,assumptions,limitations,source_versions,reporting_period,freshness,run_id) values($1,$2,$3,$4,$5,'1.0',$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      org,
      project,
      actor,
      question,
      method,
      json(result),
      json(assumptions),
      json(limitations),
      json(source),
      period,
      AS_OF,
      runId,
    ],
  );
  return e;
}
export async function createRecommendation(
  c: Client,
  project: string,
  title: string,
  problem: string,
  action: Record<string, unknown>,
  benefit: string,
  evidenceId: string,
  assumptions: string[],
  state = 'Draft',
) {
  const { org, actor } = await context(c, project);
  const r = await one(
    c,
    `insert into recommendations(organisation_id,project_id,created_by,title,problem,proposed_action,expected_benefit,evidence_ids,assumptions,limitations,state,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$3) returning *`,
    [
      org,
      project,
      actor,
      title,
      problem,
      json(action),
      benefit,
      json([evidenceId]),
      json(assumptions),
      json([
        'Requires human verification of local conditions. Synthetic demonstration evidence, not observed real-world benefit.',
      ]),
      state,
    ],
  );
  await c.query(
    'insert into recommendation_evidence(organisation_id,project_id,created_by,recommendation_id,evidence_id) values($1,$2,$3,$4,$5)',
    [org, project, actor, r.id, evidenceId],
  );
  await audit(
    c,
    org,
    project,
    actor,
    'recommendation.created',
    'recommendations',
    String(r.id),
    null,
    r,
  );
  return r;
}
export async function addAlert(
  c: Client,
  project: string,
  data: {
    category: string;
    severity: string;
    title: string;
    triggering_condition: string;
    source_records: unknown[];
    evidence_id: string;
    recommended_action: string;
    dedupe_key: string;
  },
) {
  const { org, actor } = await context(c, project);
  const existing = (
    await c.query('select id from operational_alerts where project_id=$1 and dedupe_key=$2', [
      project,
      data.dedupe_key,
    ])
  ).rows[0];
  if (existing) return existing;
  const owner =
    (
      await c.query(
        "select user_id as id from project_memberships where project_id=$1 and role='programme_manager' limit 1",
        [project],
      )
    ).rows[0]?.id || actor;
  return one(
    c,
    `insert into operational_alerts(organisation_id,project_id,created_by,category,severity,title,triggering_condition,source_records,evidence_id,recommended_action,dedupe_key,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      org,
      project,
      actor,
      data.category,
      data.severity,
      data.title,
      data.triggering_condition,
      json(data.source_records),
      data.evidence_id,
      data.recommended_action,
      data.dedupe_key,
      owner,
    ],
  );
}
export async function stockAnalysis(c: Client, project: string, persist = true) {
  const { project: p, org, actor } = await context(c, project);
  const version = await latestVersion(c, project, 'inventory');
  if (!version) return { rows: [], as_of: null, evidence_id: null };
  const rows = (
    await c.query(
      `select i.*,f.name facility_name,f.district,f.country,pr.name product_name,pr.unit,del.expected_date expected_delivery,del.lead_time_days,del.id delivery_id from inventory_records i join facilities f on f.id=i.facility_id join medicine_products pr on pr.id=i.product_id left join lateral(select * from deliveries dl where dl.facility_id=i.facility_id and dl.product_id=i.product_id and dl.status<>'Received' order by expected_date limit 1) del on true where i.project_id=$1 and i.version_id=$2 and i.reporting_date=(select max(reporting_date) from inventory_records where project_id=$1 and version_id=$2) order by f.name,pr.name`,
      [project, version.id],
    )
  ).rows;
  const threshold = Number((p.settings as Record<string, unknown>)?.stock_threshold_days || 21);
  const result: any[] = [];
  for (const r of rows) {
    const history = (
      await c.query(
        `select reporting_date,quantity_dispensed from inventory_records where project_id=$1 and version_id=$2 and facility_id=$3 and product_id=$4 and reporting_date<=$5 and reporting_date>($5::date-28) order by reporting_date`,
        [project, version.id, r.facility_id, r.product_id, r.reporting_date],
      )
    ).rows;
    const daily =
      history.length === 4 && history.every((h) => h.quantity_dispensed !== null)
        ? history.reduce((s, h) => s + Number(h.quantity_dispensed), 0) / 28
        : null;
    const days = daysOfStock(Number(r.usable_stock), daily);
    const risk = stockRisk(
      days,
      r.lead_time_days === null ? null : Number(r.lead_time_days),
      threshold,
      Number(r.usable_stock),
    );
    const reason =
      daily === null
        ? 'Four complete weekly observations are required.'
        : risk === 'No demand'
          ? 'No consumption observed; do not interpret as infinite reliable coverage.'
          : risk === 'Critical'
            ? `${days!.toFixed(1)} days usable stock; expected lead time ${r.lead_time_days ?? 'unknown'} days.`
            : `${days!.toFixed(1)} days of usable stock compared with the ${threshold}-day review threshold.`;
    result.push({
      ...r,
      opening_stock: Number(r.opening_stock),
      closing_stock: Number(r.closing_stock),
      usable_stock: Number(r.usable_stock),
      reserved_stock: Number(r.reserved_stock),
      quantity_dispensed: Number(r.quantity_dispensed),
      daily_consumption: daily,
      days_of_stock: days,
      risk,
      reason,
      transfer_opportunity: null as Transfer | null,
    });
  }
  const donorRemaining = new Map<string, number>();
  const donors = result.filter((r) => r.risk === 'Stable'),
    recipients = result.filter((r) => ['Critical', 'Elevated'].includes(r.risk));
  for (const recipient of recipients) {
    const donor = donors.find(
      (d) =>
        d.product_id === recipient.product_id &&
        d.unit === recipient.unit &&
        d.country === recipient.country &&
        d.facility_id !== recipient.facility_id &&
        Number(donorRemaining.get(d.id) ?? d.usable_stock) >
          Number(d.minimum_stock) + Number(d.daily_consumption) * 35,
    );
    if (!donor || !recipient.daily_consumption) continue;
    const expiryDays = Math.floor(
      (Date.parse(String(donor.expiry_date)) - Date.parse(String(recipient.reporting_date))) /
        86400000,
    );
    const qty = transferQuantity(
      Number(donorRemaining.get(donor.id) ?? donor.usable_stock),
      Number(donor.daily_consumption),
      28,
      Math.max(0, recipient.daily_consumption * 28 - Number(recipient.usable_stock)),
      2,
      expiryDays,
      Number(donor.minimum_stock),
    );
    if (qty > 0) {
      donorRemaining.set(
        donor.id,
        Number(donorRemaining.get(donor.id) ?? donor.usable_stock) - qty,
      );
      recipient.transfer_opportunity = {
        donor_id: donor.facility_id,
        donor_name: donor.facility_name,
        recipient_id: recipient.facility_id,
        recipient_name: recipient.facility_name,
        product_id: recipient.product_id,
        product_name: recipient.product_name,
        quantity: qty,
        unit: recipient.unit,
        transit_days: 2,
        donor_days_after: Number(donorRemaining.get(donor.id)) / Number(donor.daily_consumption),
        recipient_days_after: (Number(recipient.usable_stock) + qty) / recipient.daily_consumption,
        source_records: [donor.id, recipient.id],
        constraints: [
          'Same country and programme',
          'Matching product and unit',
          'Donor retains minimum stock plus 30 days demand',
          'Batch expires at least 16 days after snapshot',
          'Human feasibility and transport review required',
        ],
      };
    }
  }
  if (!persist) return { rows: result, as_of: version.period_end, evidence_id: null };
  const summary = {
    facilities: new Set(result.map((r) => r.facility_id)).size,
    products: new Set(result.map((r) => r.product_id)).size,
    critical: result.filter((r) => r.risk === 'Critical').length,
    elevated: result.filter((r) => r.risk === 'Elevated').length,
    unknown: result.filter((r) => r.risk === 'Unknown').length,
    near_expiry: result.filter(
      (r) =>
        Number(r.usable_stock) > 0 &&
        (Date.parse(String(r.expiry_date)) - Date.parse(String(r.reporting_date))) / 86400000 <= 60,
    ).length,
    redistribution_opportunities: result.filter((r) => r.transfer_opportunity).length,
    rows: result,
  };
  const run = await one(
    c,
    `insert into analytical_runs(organisation_id,project_id,created_by,kind,method,method_version,configuration,status,result,dataset_version_id) values($1,$2,$3,'inventory','Usable stock / trailing 28-day consumption','stock-1.0',$4,'Completed',$5,$6) returning *`,
    [org, project, actor, json({ threshold, history_days: 28 }), json(summary), version.id],
  );
  const evidence = await saveEvidence(
    c,
    project,
    'Which facilities need medicine supply attention?',
    'Deterministic inventory balance and coverage rules',
    summary,
    ['inventory'],
    String(version.period_end),
    [
      'Four weekly observations define daily consumption.',
      'Two-day transfer is a planning assumption, not a measured route duration.',
    ],
    [
      'Snapshot risk, not a live alert.',
      'Consumption may be censored by stockouts.',
      'Near-expiry stock remains usable until expiry; feasibility requires review.',
    ],
    String(run.id),
  );
  for (const r of result.filter((r) => ['Critical', 'Elevated'].includes(r.risk)))
    await addAlert(c, project, {
      category: 'Medicine supply',
      severity: r.risk === 'Critical' ? 'Critical' : 'High',
      title: `${r.facility_name} · ${r.product_name}`,
      triggering_condition: r.reason,
      source_records: [r.id],
      evidence_id: String(evidence.id),
      recommended_action:
        'Verify usable stock and delivery date with the facility, then review redistribution or expedited supply.',
      dedupe_key: `stock-${r.facility_id}-${r.product_id}-${r.reporting_date}`,
    });
  return { rows: result, as_of: version.period_end, evidence_id: evidence.id, summary };
}
export async function forecastAnalysis(c: Client, project: string, persist = true) {
  const { org, actor } = await context(c, project);
  const version = await latestVersion(c, project, 'inventory');
  if (!version) return null;
  const consumptionVersion = (await latestVersion(c, project, 'consumption')) || version;
  const groups = (
    await c.query(
      `select c.facility_id,c.product_id,f.name facility_name,f.district,f.facility_type,p.name product_name,c.period_end,c.quantity from consumption_records c join facilities f on f.id=c.facility_id join medicine_products p on p.id=c.product_id where c.project_id=$1 and c.version_id=$2 order by c.period_end`,
      [project, consumptionVersion.id],
    )
  ).rows;
  const grouped = new Map<
    string,
    { name: string; district: string; type: string; values: { date: string; value: number }[] }
  >();
  for (const r of groups) {
    const key = `${r.facility_id}-${r.product_id}`;
    if (!grouped.has(key))
      grouped.set(key, {
        name: `${r.facility_name} · ${r.product_name}`,
        district: String(r.district),
        type: String(r.facility_type),
        values: [],
      });
    grouped.get(key)!.values.push({ date: String(r.period_end), value: Number(r.quantity) });
  }
  const evaluated = [...grouped.entries()]
    .filter(([, g]) => g.values.length >= 24)
    .map(([key, g]) => ({
      ...evaluateSeries(g.values, g.name, key),
      values: g.values,
      district: g.district,
      facility_type: g.type,
    }));
  if (!evaluated.length) return null;
  const methodNames = ['Moving average (4 weeks)', 'Exponential smoothing (α=0.3)'];
  const aggregate = (period: 'validation' | 'test', subset = evaluated) =>
    methodNames.map((method) => {
      const pairs = subset.map((e) => {
        const xs = e.values.map((v) => v.value);
        const end =
          period === 'validation'
            ? Math.floor(xs.length * 0.7) + Math.floor(xs.length * 0.15)
            : xs.length;
        const start =
          period === 'validation'
            ? Math.floor(xs.length * 0.7)
            : Math.floor(xs.length * 0.7) + Math.floor(xs.length * 0.15);
        const fn = (h: number[]) =>
          method === methodNames[0] ? movingAverage(h) : exponentialSmooth(h);
        return {
          actual: xs.slice(start, end),
          predicted: xs.slice(start, end).map((_, i) => fn(xs.slice(0, start + i))),
        };
      });
      return {
        ...metrics(
          pairs.flatMap((p) => p.actual),
          pairs.flatMap((p) => p.predicted),
        ),
        method,
      };
    });
  const validation = aggregate('validation'),
    test = aggregate('test');
  const best = [...validation].sort((a, b) => a.mae - b.mae)[0].method;
  const subgroup = ['district', 'facility_type'].flatMap((field) =>
    [...new Set(evaluated.map((e) => e[field as 'district' | 'facility_type']))].map((group) => {
      const es = evaluated.filter((e) => e[field as 'district' | 'facility_type'] === group);
      return { field, group, series_count: es.length, metrics: aggregate('test', es) };
    }),
  );
  const result = {
    methods: methodNames,
    best_method: best,
    validation,
    test,
    horizon: 4,
    series: evaluated.map(({ values: _, validation: __, test: ___, ...e }) => e),
    subgroup,
    train_period: evaluated[0].train_period,
    validation_period: evaluated[0].validation_period,
    test_period: evaluated[0].test_period,
    series_evaluated: evaluated.length,
    limitations: [
      '70% train / 15% validation / 15% test, chronological within each series.',
      'Method selected on validation only; test not used for tuning.',
      '80% empirical residual envelopes are uncalibrated sensitivity bounds, not guaranteed prediction intervals.',
      'Stockout-censored consumption is not true demand.',
      'Fewer than two seasonal cycles: seasonal-naive not evaluated.',
      'Subgroup sample sizes are reported; no fairness or accuracy guarantee.',
    ],
  };
  if (!persist) return result;
  const run = await one(
    c,
    `insert into analytical_runs(organisation_id,project_id,created_by,kind,method,method_version,configuration,status,result,dataset_version_id) values($1,$2,$3,'forecast','Time-aware baseline comparison','forecast-1.0',$4,'Completed',$5,$6) returning *`,
    [org, project, actor, json({ window: 4, alpha: 0.3, horizon: 4 }), json(result), version.id],
  );
  const e = await saveEvidence(
    c,
    project,
    'How do baseline demand forecasts perform on held-out weeks?',
    'Chronological train / validation / test evaluation',
    result,
    ['inventory', 'consumption'],
    String(version.period_end),
    ['Weekly consumption is the target.'],
    result.limitations,
    String(run.id),
  );
  return { ...result, evidence_id: e.id };
}
export async function financeAnalysis(c: Client, project: string, persist = true) {
  const { org, actor, project: p } = await context(c, project);
  const versions: Record<string, unknown> = {};
  for (const kind of ['budgets', 'funding_releases', 'procurement_events', 'expenditure_records'])
    versions[kind] = (await latestVersion(c, project, kind))?.id;
  const get = async (table: string): Promise<any[]> =>
    versions[table]
      ? (
          await c.query('select * from ' + table + ' where project_id=$1 and version_id=$2', [
            project,
            versions[table],
          ])
        ).rows
      : [];
  const budgets = await get('budgets'),
    releases = await get('funding_releases'),
    expenditures = await get('expenditure_records'),
    procurement = await get('procurement_events');
  const ids = new Set(budgets.map((b) => b.id));
  const asOf = String((p.settings as Record<string, unknown>)?.as_of || AS_OF);
  const currencies = [...new Set([...budgets, ...expenditures].map((b) => String(b.currency)))];
  const byCurrency = currencies.map((currency) => {
    const bs = budgets.filter((b) => b.currency === currency),
      rs = releases.filter((r) => r.currency === currency),
      ex = expenditures.filter((r) => r.currency === currency);
    return {
      currency,
      allocations: aggregateFinance(
        bs.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        currency,
      ).total_cents,
      releases: aggregateFinance(
        rs.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        currency,
      ).total_cents,
      commitments: aggregateFinance(
        ex
          .filter((x) => x.event_type === 'Commitment')
          .map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        currency,
      ).total_cents,
      payments: aggregateFinance(
        ex
          .filter((x) => x.event_type === 'Payment')
          .map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        currency,
      ).total_cents,
      expenditure: aggregateFinance(
        ex
          .filter((x) => x.event_type === 'Expenditure')
          .map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        currency,
      ).total_cents,
    };
  });
  const programmes = budgets.map((b) => {
    const rs = releases.filter((r) => r.budget_id === b.id),
      ex = expenditures.filter((r) => r.budget_id === b.id && r.event_type === 'Expenditure');
    return {
      ...b,
      amount_cents: Number(b.amount_cents),
      released_cents: rs.reduce((s, r) => s + Number(r.amount_cents), 0),
      expenditure_cents: ex.reduce((s, r) => s + Number(r.amount_cents), 0),
      unreleased_cents: Number(b.amount_cents) - rs.reduce((s, r) => s + Number(r.amount_cents), 0),
    };
  });
  const overdueReleases = releases.filter(
      (r) => r.status !== 'Released' && String(r.due_date) < asOf,
    ),
    delayedProcurement = procurement.filter((r) => !r.completed_date && String(r.due_date) < asOf),
    unmatched = expenditures.filter((r) => !r.budget_id || !ids.has(r.budget_id));
  const result = {
    as_of: asOf,
    by_currency: byCurrency,
    programmes,
    overdue_releases: overdueReleases,
    delayed_procurement: delayedProcurement,
    unmatched,
    limitations: [
      'No currency conversion; currencies are reported separately.',
      'Commitments, payments and recognised expenditure are distinct events, not additive totals.',
      'Unexplained variance is an investigation prompt, never an inference of fraud.',
      'Repeated imports use explicit external identifiers and require review.',
    ],
  };
  if (!persist) return result;
  const run = await one(
    c,
    `insert into analytical_runs(organisation_id,project_id,created_by,kind,method,method_version,status,result) values($1,$2,$3,'finance','Integer-minor-unit reconciliation','finance-1.0','Completed',$4) returning *`,
    [org, project, actor, json(result)],
  );
  const e = await saveEvidence(
    c,
    project,
    'Where are funding and procurement activities delayed?',
    'Currency-separated reconciliation and explicit due-date rules',
    result,
    ['budgets', 'funding_releases', 'procurement_events', 'expenditure_records'],
    asOf,
    ['Synthetic financial records; amounts in explicit currencies.'],
    result.limitations,
    String(run.id),
  );
  for (const r of overdueReleases)
    await addAlert(c, project, {
      category: 'Funding release',
      severity: 'High',
      title: `Overdue release · ${r.external_id}`,
      triggering_condition: `Release due ${r.due_date}; still pending at ${asOf}.`,
      source_records: [r.id],
      evidence_id: String(e.id),
      recommended_action:
        'Confirm release status and document the administrative blocker with the finance owner.',
      dedupe_key: `release-${r.id}`,
    });
  for (const r of delayedProcurement)
    await addAlert(c, project, {
      category: 'Procurement',
      severity: 'High',
      title: `Stage overdue · ${r.title}`,
      triggering_condition: `${r.stage} due ${r.due_date}; no completion recorded at ${asOf}.`,
      source_records: [r.id],
      evidence_id: String(e.id),
      recommended_action:
        'Verify stage completion, responsible approver, and dependencies. Do not infer misconduct.',
      dedupe_key: `procurement-${r.id}`,
    });
  if (unmatched.length)
    await addAlert(c, project, {
      category: 'Reconciliation',
      severity: 'High',
      title: `${unmatched.length} unmatched financial transaction`,
      triggering_condition: 'Transaction has no matching programme budget in this project.',
      source_records: unmatched.map((r) => r.id),
      evidence_id: String(e.id),
      recommended_action:
        'Obtain the source reference and correct the programme mapping; do not silently reconcile.',
      dedupe_key: `unmatched-${unmatched
        .map((r) => r.id)
        .sort()
        .join('-')}`,
    });
  return { ...result, evidence_id: e.id };
}
export async function saveScenario(c: Client, project: string, id: string) {
  const { org, actor } = await context(c, project);
  const s = await one(c, 'select * from optimisation_scenarios where id=$1 and project_id=$2', [
    id,
    project,
  ]);
  const options = (
    await c.query('select * from intervention_options where project_id=$1 order by name', [project])
  ).rows.map((o) => ({
    ...o,
    cost_cents: Number(o.cost_cents),
    expected_outcome: Number(o.expected_outcome),
    capacity: Number(o.capacity),
    implementation_months: Number(o.implementation_months),
  })) as Option[];
  const result = optimise(
    options,
    Number(s.budget_cents),
    String(s.currency),
    s.constraints as Constraints,
  );
  const updated = await one(
    c,
    "update optimisation_scenarios set result=$1,option_snapshot=$2,status='Computed' where id=$3 returning *",
    [json(result), json(options), id],
  );
  const e = await saveEvidence(
    c,
    project,
    `Which portfolio is feasible under ${s.name}?`,
    result.method,
    { ...result, options, budget_cents: Number(s.budget_cents), constraints: s.constraints },
    ['intervention_options'],
    `Scenario ${s.name}`,
    result.assumptions,
    ['Not a policy decision. Requires human review and verified local outcome evidence.'],
  );
  await c.query(
    'insert into recommendation_evidence(organisation_id,project_id,created_by,recommendation_id,evidence_id) select $1,$2,$3,id,$4 from recommendations where project_id=$2 and id=$5 on conflict do nothing',
    [org, project, actor, e.id, s.recommendation_id],
  );
  await audit(
    c,
    org,
    project,
    actor,
    'scenario.computed',
    'optimisation_scenarios',
    id,
    s,
    updated,
  );
  return { ...updated, evidence_id: e.id };
}
export function reportMarkdown(
  title: string,
  kind: string,
  evidence: Record<string, unknown>[],
  project: string,
) {
  const lines = [
    `# ${title}`,
    '',
    '**SYNTHETIC DEMONSTRATION — not real operational or government data.**',
    '',
    `Project reference: ${project}`,
    `Generated: ${new Date().toISOString()}`,
    `Report type: ${kind}`,
    '',
  ];
  for (const [i, e] of evidence.entries()) {
    lines.push(
      `## ${i + 1}. ${e.question}`,
      `Method: ${e.method} · ${e.method_version}`,
      `Reporting period: ${e.reporting_period}`,
      `Source versions: ${JSON.stringify(e.source_versions)}`,
      `Classification: ${e.classification}`,
      '### Computed evidence',
      '```json',
      JSON.stringify(e.result, null, 2),
      '```',
      '### Assumptions',
      ...((e.assumptions as string[]) || []).map((x) => '- ' + x),
      '### Limitations',
      ...((e.limitations as string[]) || []).map((x) => '- ' + x),
      '',
    );
  }
  lines.push(
    '## Human review',
    'This report supports investigation and review. It does not execute a transfer, release funds, approve procurement, or establish causal health impact.',
    '',
  );
  return lines.join('\n');
}
export const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
