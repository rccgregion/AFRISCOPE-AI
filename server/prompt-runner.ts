/**
 * Experiment Lab prompt runner.
 *
 * Every answer is computed from rows that actually exist in this workspace. If
 * the rows needed are absent the runner says exactly what is missing; it never
 * substitutes plausible-looking facilities, stock levels or financing signals.
 *
 * Deterministic only — no language model is called, so no number in the answer
 * can come from anywhere except the query results returned here.
 */
import type { Client } from './db.js';
import { SAVED_PROMPTS, PROMPT_SCOPE_LABEL, type PromptScope } from './prompts.js';

export type PromptRow = {
  facility: string;
  facility_id: string;
  country: string | null;
  medicine: string;
  usable_stock: number;
  avg_daily_consumption: number | null;
  coverage_days: number | null;
  financing_signal: string | null;
  as_of_date: string;
  data_origin: string;
};

export type PromptRun = {
  prompt_id: string;
  prompt_title: string;
  prompt: string;
  scope: PromptScope;
  scope_statement: string;
  status: 'answered' | 'insufficient_data';
  answer: string;
  missing: string[];
  rows: PromptRow[];
  sample_label: string | null;
  uses_sample_data: boolean;
  unverified_claims: string[];
  limitations: string[];
};

type Counts = { sample: number; real: number };

async function originCounts(c: Client, project: string): Promise<Counts> {
  const row = (
    await c.query(
      `select count(*) filter (where data_origin='sample')::int as sample,
              count(*) filter (where data_origin='real')::int as real
         from inventory_records where project_id=$1`,
      [project],
    )
  ).rows[0] as unknown as { sample: number; real: number };
  return { sample: Number(row.sample), real: Number(row.real) };
}

/** Latest reading per facility + medicine inside the requested origin scope. */
async function scopedRows(c: Client, project: string, scope: PromptScope): Promise<PromptRow[]> {
  const origins = scope === 'both' ? ['sample', 'real'] : [scope];
  const rows = await c.query(
    `select distinct on (i.facility_id, i.product_id)
            f.name as facility, f.external_id as facility_id, f.country,
            p.name as medicine, i.usable_stock, i.avg_daily_consumption,
            i.coverage_days, i.financing_signal, i.reporting_date as as_of_date,
            i.data_origin
       from inventory_records i
       join facilities f on f.id = i.facility_id
       join medicine_products p on p.id = i.product_id
      where i.project_id=$1 and i.data_origin = any($2::text[])
      order by i.facility_id, i.product_id, i.reporting_date desc`,
    [project, origins],
  );
  return rows.rows.map((r) => ({
    facility: String(r.facility),
    facility_id: String(r.facility_id),
    country: r.country == null ? null : String(r.country),
    medicine: String(r.medicine),
    usable_stock: Number(r.usable_stock),
    avg_daily_consumption: r.avg_daily_consumption == null ? null : Number(r.avg_daily_consumption),
    coverage_days: r.coverage_days == null ? null : Number(r.coverage_days),
    financing_signal: r.financing_signal == null ? null : String(r.financing_signal),
    as_of_date: String(r.as_of_date).slice(0, 10),
    data_origin: String(r.data_origin),
  }));
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export async function runPrompt(
  c: Client,
  project: string,
  promptId: string,
  scope: PromptScope,
): Promise<PromptRun> {
  const def = SAVED_PROMPTS.find((p) => p.id === promptId);
  if (!def) throw new Error('Unknown prompt');
  const rows = await scopedRows(c, project, scope);
  const counts = await originCounts(c, project);
  const scopedCount =
    scope === 'both' ? counts.sample + counts.real : counts[scope === 'sample' ? 'sample' : 'real'];

  const base = {
    prompt_id: def.id,
    prompt_title: def.title,
    prompt: def.prompt,
    scope,
    scope_statement: `Data scope used: ${PROMPT_SCOPE_LABEL[scope]}.`,
    unverified_claims: def.unverified_claims ?? [],
    uses_sample_data: rows.some((r) => r.data_origin === 'sample'),
    sample_label: rows.some((r) => r.data_origin === 'sample')
      ? 'Sample data - not reported by any facility'
      : null,
    limitations: [
      'Deterministic computation over rows already imported into this workspace. No language model was called and no external data was fetched.',
      'Decision support only, not a binding decision. A named human must review the underlying rows and the source before acting.',
    ],
  };

  // What the prompt needs, and whether this workspace has it.
  const missing: string[] = [];
  if (def.requires.includes('stock') && !rows.length)
    missing.push(
      scope === 'real'
        ? 'Stock readings tagged as real data. Import real stock rows (or choose the Sample or Both scope).'
        : 'Any stock readings in this project.',
    );
  if (def.requires.includes('financing') && !rows.some((r) => r.financing_signal))
    missing.push('Rows carrying a financing signal.');
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))] as string[];
  if (def.requires.includes('countries') && countries.length < 2)
    missing.push('Stock readings for more than one country.');

  if (missing.length)
    return {
      ...base,
      status: 'insufficient_data',
      missing,
      rows: [],
      answer:
        `This prompt cannot be answered from the current workspace. Missing: ${missing.join(' ')} ` +
        `The workspace holds ${counts.sample} sample stock reading(s) and ${counts.real} real stock reading(s) in total, ` +
        `${scopedCount} in the selected scope. No facilities, stock levels or financing signals are invented to fill the gap.`,
    };

  const withCoverage = rows.filter(
    (r) => r.coverage_days != null && (r.avg_daily_consumption ?? 0) > 0,
  );
  const risky = [...withCoverage]
    .sort((a, b) => (a.coverage_days ?? 0) - (b.coverage_days ?? 0))
    .slice(0, 5);
  const asOf = rows.reduce(
    (min, r) => (r.as_of_date < min ? r.as_of_date : min),
    rows[0].as_of_date,
  );
  const delayed = risky.filter(
    (r) => r.financing_signal && /delay|pending|overdue|await/i.test(r.financing_signal),
  );

  const lines: string[] = [];
  if (def.requires.includes('stock') || withCoverage.length) {
    if (risky.length) {
      lines.push(
        `Across ${rows.length} facility–medicine reading(s) from ${countries.length} countr${countries.length === 1 ? 'y' : 'ies'} ` +
          `(${base.scope_statement.toLowerCase()}), the lowest computed coverage is:`,
      );
      for (const r of risky) {
        lines.push(
          `- ${r.facility} (${r.facility_id}, ${r.country ?? 'country not recorded'}) — ${r.medicine}: ` +
            `usable stock ${fmt(r.usable_stock)} units, average daily consumption ${fmt(r.avg_daily_consumption ?? 0)}, ` +
            `coverage ${fmt(r.coverage_days ?? 0)} days, as of ${r.as_of_date}` +
            (r.financing_signal
              ? `; financing signal: ${r.financing_signal}`
              : '; no financing signal recorded') +
            '.',
        );
      }
    } else {
      lines.push(
        'No reading in scope has a usable stock and a non-zero average daily consumption, so no days-of-stock estimate is produced.',
      );
    }
    if (delayed.length)
      lines.push(
        `${delayed.length} of those readings also carry a financing signal that reads as delayed or pending: ` +
          delayed.map((r) => `${r.facility} (${r.financing_signal})`).join('; ') +
          '. Delay wording is reported as recorded, not interpreted as a cause.',
      );
  }

  if (def.requires.includes('countries')) {
    const byCountry = new Map<string, number>();
    for (const r of rows)
      byCountry.set(
        String(r.country ?? 'not recorded'),
        (byCountry.get(String(r.country ?? 'not recorded')) ?? 0) + 1,
      );
    lines.push(
      'Readings by country: ' +
        [...byCountry.entries()].map(([k, v]) => `${k} ${v}`).join(', ') +
        '. Differences between countries here reflect the rows imported into this workspace and nothing else.',
    );
  }

  lines.push(
    `Source dates in scope range up to ${rows.reduce((max, r) => (r.as_of_date > max ? r.as_of_date : max), asOf)}; ` +
      'every figure above is traceable to those imported rows.',
  );
  if (def.unverified_claims?.length)
    lines.push(
      'The Horizon 1000 description in this prompt is UNVERIFIED in this build. Treat it as a claim to confirm with the programme, not as an established fact.',
    );

  return {
    ...base,
    status: 'answered',
    missing: [],
    rows: risky.length ? risky : withCoverage.slice(0, 5),
    answer: lines.join('\n'),
  };
}
