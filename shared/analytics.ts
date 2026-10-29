import { TRANSITIONS, type RecommendationState, type ForecastMetric } from './domain';

export function inventoryBalance(r: {
  opening_stock: number;
  quantity_received: number;
  quantity_dispensed: number;
  adjustments: number;
  closing_stock: number;
  usable_stock: number;
  reserved_stock: number;
  expired_stock: number;
}) {
  const errors: string[] = [];
  if (Object.values(r).some((v) => !Number.isSafeInteger(v)))
    errors.push('Inventory quantities must be safe integers.');
  if (
    [
      r.opening_stock,
      r.quantity_received,
      r.quantity_dispensed,
      r.closing_stock,
      r.usable_stock,
      r.reserved_stock,
      r.expired_stock,
    ].some((v) => v < 0)
  )
    errors.push('Only adjustments may be negative.');
  if (
    r.opening_stock + r.quantity_received - r.quantity_dispensed + r.adjustments !==
    r.closing_stock
  )
    errors.push('Opening + receipts − consumption + adjustments must equal closing stock.');
  if (r.usable_stock + r.reserved_stock + r.expired_stock > r.closing_stock)
    errors.push('Usable, reserved and expired stock cannot exceed closing stock.');
  return errors;
}
export function daysOfStock(usable: number, daily: number | null, reliable = true): number | null {
  return !reliable || daily === null || !Number.isFinite(daily) || daily <= 0 || usable < 0
    ? null
    : usable / daily;
}
export function stockRisk(
  days: number | null,
  lead: number | null,
  threshold: number,
  usable: number,
) {
  if (days === null) return usable === 0 ? 'Unknown' : 'No demand';
  if (usable === 0 || (lead !== null && days < lead)) return 'Critical';
  return days < threshold ? 'Elevated' : 'Stable';
}
export function transferQuantity(
  donorUsable: number,
  donorDaily: number,
  reserveDays: number,
  recipientNeed: number,
  transitDays: number,
  daysToExpiry: number,
  minimumStock = 0,
) {
  if (
    [
      donorUsable,
      donorDaily,
      reserveDays,
      recipientNeed,
      transitDays,
      daysToExpiry,
      minimumStock,
    ].some((v) => !Number.isFinite(v) || v < 0)
  )
    return 0;
  if (daysToExpiry < transitDays + 14) return 0;
  const excess = Math.floor(donorUsable - minimumStock - donorDaily * (reserveDays + transitDays));
  return Math.max(0, Math.min(excess, Math.ceil(recipientNeed)));
}
export function metrics(actual: number[], predicted: number[]): ForecastMetric {
  if (
    !actual.length ||
    actual.length !== predicted.length ||
    [...actual, ...predicted].some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error('Metrics require paired, finite, non-negative observations.');
  const n = actual.length,
    errors = actual.map((a, i) => predicted[i] - a),
    sum = actual.reduce((a, b) => a + b, 0);
  return {
    method: '',
    n,
    mae: errors.reduce((a, b) => a + Math.abs(b), 0) / n,
    wape: sum === 0 ? null : errors.reduce((a, b) => a + Math.abs(b), 0) / sum,
    bias: errors.reduce((a, b) => a + b, 0) / n,
  };
}
export function movingAverage(history: number[], window = 4) {
  if (history.length < window) throw new Error('Insufficient history');
  return history.slice(-window).reduce((a, b) => a + b, 0) / window;
}
export function exponentialSmooth(history: number[], alpha = 0.3) {
  if (!history.length) throw new Error('Insufficient history');
  return history.reduce((level, x) => alpha * x + (1 - alpha) * level, history[0]);
}
export function evaluateSeries(
  values: { date: string; value: number }[],
  name: string,
  key: string,
) {
  if (values.length < 24) throw new Error('At least 24 weekly observations are required.');
  if (values.some((v) => !Number.isFinite(v.value) || v.value < 0))
    throw new Error('Missing or negative consumption must be resolved before evaluation.');
  const xs = values.map((v) => v.value),
    trainEnd = Math.floor(xs.length * 0.7),
    validationEnd = trainEnd + Math.floor(xs.length * 0.15);
  const candidates = [
    { name: 'Moving average (4 weeks)', fn: (h: number[]) => movingAverage(h) },
    { name: 'Exponential smoothing (α=0.3)', fn: (h: number[]) => exponentialSmooth(h) },
  ];
  const validation = candidates.map((c) => ({
    ...metrics(
      xs.slice(trainEnd, validationEnd),
      xs.slice(trainEnd, validationEnd).map((_, j) => c.fn(xs.slice(0, trainEnd + j))),
    ),
    method: c.name,
  }));
  const best = validation[0].mae <= validation[1].mae ? candidates[0] : candidates[1];
  const predict = (end: number, c: typeof best) =>
    xs.slice(validationEnd, end).map((_, j) => c.fn(xs.slice(0, validationEnd + j)));
  const test = candidates.map((c) => ({
    ...metrics(xs.slice(validationEnd), predict(xs.length, c)),
    method: c.name,
  }));
  const residuals = xs
    .slice(trainEnd, validationEnd)
    .map((x, i) => x - best.fn(xs.slice(0, trainEnd + i)));
  const sorted = residuals.map(Math.abs).sort((a, b) => a - b),
    radius = sorted[Math.min(sorted.length - 1, Math.ceil(0.8 * sorted.length) - 1)] || 0;
  const points: {
    date: string;
    actual: number | null;
    predicted: number | null;
    lower: number | null;
    upper: number | null;
  }[] = values.map((v, i) => ({
    date: v.date,
    actual: v.value,
    predicted: i >= validationEnd ? best.fn(xs.slice(0, i)) : null,
    lower: null,
    upper: null,
  }));
  const history = [...xs];
  for (let i = 1; i <= 4; i++) {
    const forecast = best.fn(history);
    const d = new Date(values.at(-1)!.date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7 * i);
    points.push({
      date: d.toISOString().slice(0, 10),
      actual: null,
      predicted: forecast,
      lower: Math.max(0, forecast - radius),
      upper: forecast + radius,
    });
    history.push(forecast);
  }
  return {
    key,
    name,
    points,
    validation: validation.map((m) => ({
      ...m,
      mae: round(m.mae),
      wape: m.wape === null ? null : round(m.wape),
      bias: round(m.bias),
    })),
    test: test.map((m) => ({
      ...m,
      mae: round(m.mae),
      wape: m.wape === null ? null : round(m.wape),
      bias: round(m.bias),
    })),
    best_method: best.name,
    train_period: `${values[0].date} / ${values[trainEnd - 1].date}`,
    validation_period: `${values[trainEnd].date} / ${values[validationEnd - 1].date}`,
    test_period: `${values[validationEnd].date} / ${values.at(-1)!.date}`,
    radius,
  };
}
const round = (x: number) => Math.round(x * 1000) / 1000;
export interface FinanceInput {
  currency?: string;
  amount_cents: number;
  period?: string;
  programme_code?: string;
  budget_id?: string | null;
  event_type?: string;
  status?: string;
  due_date?: string;
  released_date?: string | null;
}
export function aggregateFinance(rows: FinanceInput[], currency?: string) {
  if (!rows.length)
    return { currency: currency || null, total_cents: 0, by_currency: {}, by_period: {} };
  if (!currency && new Set(rows.map((r) => r.currency)).size > 1)
    throw new Error('Select a currency before aggregating. No implicit exchange conversion.');
  if (currency && rows.some((r) => r.currency !== currency))
    throw new Error('Mixed currencies cannot be summed; select matching records first.');
  const selected = rows
    .filter((r) => !currency || r.currency === currency)
    .map((r) => ({
      ...r,
      currency: r.currency || currency || '',
      period: r.period || 'Unspecified',
    }));
  const codes = new Set(selected.map((r) => r.currency));
  if (codes.size > 1) throw new Error('Mixed currencies cannot be summed.');
  if (selected.some((r) => !Number.isSafeInteger(r.amount_cents) || r.amount_cents < 0))
    throw new Error('Financial amounts must be non-negative safe integer minor units.');
  const total = selected.reduce((a, r) => a + r.amount_cents, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Financial total exceeds safe integer range.');
  const by_currency: Record<string, number> = {},
    by_period: Record<string, number> = {};
  for (const r of selected) {
    by_currency[r.currency] = (by_currency[r.currency] || 0) + r.amount_cents;
    by_period[r.period] = (by_period[r.period] || 0) + r.amount_cents;
  }
  return { currency: currency || selected[0].currency, total_cents: total, by_currency, by_period };
}
export interface Option {
  id: string;
  name: string;
  cost_cents: number;
  currency: string;
  expected_outcome: number;
  capacity: number;
  implementation_months: number;
  geography: string;
  equity_group: string;
  dependencies: string[];
}
export interface Constraints {
  required_geographies: string[];
  equity_minimum: number;
  max_months: number;
  required_options?: string[];
}
export function optimise(
  options: Option[],
  budget: number,
  currency: string,
  constraints: Constraints,
) {
  if (options.length > 16)
    throw new Error(
      'This exact solver supports up to 16 discrete packages. Split the catalogue before solving.',
    );
  if (
    !Number.isSafeInteger(budget) ||
    budget < 0 ||
    options.some(
      (o) =>
        !Number.isSafeInteger(o.cost_cents) ||
        o.cost_cents <= 0 ||
        !Number.isSafeInteger(o.expected_outcome) ||
        o.expected_outcome < 0 ||
        o.capacity < o.expected_outcome,
    )
  )
    throw new Error('Invalid cost, outcome or delivery capacity.');
  if (options.some((o) => o.currency !== currency))
    throw new Error('All option costs must use the scenario currency.');
  if (new Set(options.map((o) => o.id)).size !== options.length)
    throw new Error('Option IDs must be unique.');
  const ids = new Set(options.map((o) => o.id));
  if (
    options.some((o) => o.dependencies.some((d) => !ids.has(d))) ||
    (constraints.required_options || []).some((id) => !ids.has(id))
  )
    throw new Error('A dependency or required option is absent from this project.');
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error('Circular intervention dependencies.');
    visiting.add(id);
    options.find((o) => o.id === id)!.dependencies.forEach(visit);
    visiting.delete(id);
    done.add(id);
  };
  options.forEach((o) => visit(o.id));
  let best: { ids: string[]; cost: number; outcome: number } | null = null;
  let feasibleCount = 0;
  for (let mask = 0; mask < 2 ** options.length; mask++) {
    const picked = options.filter((_, i) => (mask & (1 << i)) !== 0),
      pickedIds = new Set(picked.map((o) => o.id));
    const cost = picked.reduce((s, o) => s + o.cost_cents, 0);
    if (cost > budget) continue;
    if (
      picked.some((o) => o.dependencies.some((d) => !pickedIds.has(d))) ||
      (constraints.required_options || []).some((id) => !pickedIds.has(id))
    )
      continue;
    if (constraints.required_geographies.some((g) => !picked.some((o) => o.geography === g)))
      continue;
    if (picked.filter((o) => o.equity_group === 'Rural').length < constraints.equity_minimum)
      continue;
    if (picked.some((o) => o.implementation_months > constraints.max_months)) continue;
    const outcome = picked.reduce((s, o) => s + o.expected_outcome, 0);
    feasibleCount++;
    if (!best || outcome > best.outcome || (outcome === best.outcome && cost < best.cost))
      best = { ids: picked.map((o) => o.id), cost, outcome };
  }
  const reasons = [];
  if (constraints.equity_minimum > options.filter((o) => o.equity_group === 'Rural').length)
    reasons.push('Not enough rural packages to satisfy the equity minimum.');
  for (const g of constraints.required_geographies)
    if (
      !options.some((o) => o.geography === g && o.implementation_months <= constraints.max_months)
    )
      reasons.push(`No eligible package covers ${g} within the delivery period.`);
  const mandatory = new Set(constraints.required_options || []);
  for (const id of mandatory) {
    const o = options.find((o) => o.id === id);
    o?.dependencies.forEach((d) => mandatory.add(d));
  }
  const mandatoryCost = options
    .filter((o) => mandatory.has(o.id))
    .reduce((s, o) => s + o.cost_cents, 0);
  if (mandatoryCost > budget)
    reasons.push('Required packages and their dependencies exceed the budget.');
  if (!best && !reasons.length)
    reasons.push(
      'No combination satisfies all geographic, equity, dependency, capacity and budget constraints together. Increase the budget or relax a constraint.',
    );
  return {
    feasible: !!best,
    selected: best?.ids || [],
    total_cost_cents: best?.cost || 0,
    expected_outcome: best?.outcome || 0,
    remaining_budget_cents: best ? budget - best.cost : 0,
    evaluated_combinations: 2 ** options.length,
    feasible_combinations: feasibleCount,
    objective: 'Maximise assumed people reached; ties minimise cost.',
    method: 'Exact exhaustive binary selection with constraint filtering',
    method_version: 'allocation-1.0',
    reasons,
    assumptions: [
      'Synthetic package outcomes; not causal health effects.',
      'Package audiences may overlap; reach is not unique people without deduplication.',
      'Each package is indivisible and delivery capacity is sufficient for its stated outcome.',
    ],
  };
}
export function transition(state: RecommendationState, next: RecommendationState) {
  if (!TRANSITIONS[state]?.includes(next))
    throw new Error(`Invalid transition: ${state} → ${next}`);
}
