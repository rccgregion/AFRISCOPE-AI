/**
 * One shared origin counter.
 *
 * Every view that shows a sample/real split reads from this function, so the
 * numbers cannot drift between Data Intelligence, Programme Operations, Finance
 * and Alerts. Counts are per entity type, and they are derived from the same
 * rows the pages render:
 *
 *  - `inventory_records` counts every reading in the project;
 *  - `inventory_latest` counts the rows the Medicine supply table shows
 *    (latest dataset version, latest reporting date), so a chip count equals the
 *    number of visible rows.
 */
import type { Client } from './db.js';

export type OriginPair = { sample: number; real: number };

export const ORIGIN_ENTITIES = [
  'facilities',
  'datasets',
  'inventory_records',
  'inventory_latest',
  'operational_alerts',
  'funding_releases',
  'recommendations',
  'problem_briefs',
  'evidence_records',
] as const;

export type OriginEntity = (typeof ORIGIN_ENTITIES)[number];
export type OriginSummary = Record<OriginEntity, OriginPair> & {
  has_sample: boolean;
  has_real: boolean;
  sample_label: string;
  simulated_prefix: string;
};

const SAMPLE_LABEL = 'Sample data - not reported by any facility';
const SIMULATED_PREFIX = 'Simulated:';

const countOf = (row: Record<string, unknown> | undefined): OriginPair => ({
  sample: Number(row?.sample ?? 0),
  real: Number(row?.real ?? 0),
});

async function pairFor(c: Client, table: string, projectId: string): Promise<OriginPair> {
  const row = (
    await c.query(
      `select count(*) filter (where data_origin = 'sample')::int as sample,
              count(*) filter (where data_origin <> 'sample')::int as real
         from ${table} where project_id = $1`,
      [projectId],
    )
  ).rows[0];
  return countOf(row);
}

/**
 * Latest-version, latest-date inventory rows — the slice Programme Operations
 * renders. Kept in step with services.stockAnalysis().
 */
async function latestInventory(c: Client, projectId: string): Promise<OriginPair> {
  const row = (
    await c.query(
      `with v as (
         select dv.id from dataset_versions dv
           join datasets d on d.id = dv.dataset_id
          where d.project_id = $1 and d.kind = 'inventory'
          order by dv.created_at desc, dv.version desc limit 1
       ), d as (
         select max(reporting_date) as d from inventory_records
          where project_id = $1 and version_id = (select id from v)
       )
       select count(*) filter (where i.data_origin = 'sample')::int as sample,
              count(*) filter (where i.data_origin <> 'sample')::int as real
         from inventory_records i
        where i.project_id = $1
          and i.version_id = (select id from v)
          and i.reporting_date = (select d from d)`,
      [projectId],
    )
  ).rows[0];
  return countOf(row);
}

export async function originSummary(c: Client, projectId: string): Promise<OriginSummary> {
  const summary: Record<string, OriginPair> = {};
  for (const entity of [
    'facilities',
    'datasets',
    'inventory_records',
    'operational_alerts',
    'funding_releases',
    'recommendations',
    'problem_briefs',
    'evidence_records',
  ] as const) {
    summary[entity] = await pairFor(c, entity, projectId);
  }
  summary.inventory_latest = await latestInventory(c, projectId);
  const has_sample = Object.values(summary).some((p) => p.sample > 0);
  const has_real = Object.values(summary).some((p) => p.real > 0);
  return {
    ...(summary as Record<OriginEntity, OriginPair>),
    has_sample,
    has_real,
    sample_label: SAMPLE_LABEL,
    simulated_prefix: SIMULATED_PREFIX,
  };
}

/** Human status for the top bar: never claim "live" about demonstration rows. */
export function dataStateLabel(summary: Pick<OriginSummary, 'has_sample' | 'has_real'>) {
  if (summary.has_real && !summary.has_sample) return 'Real data loaded';
  if (summary.has_real && summary.has_sample) return 'Real and sample data';
  if (summary.has_sample) return 'Demo data';
  return 'No data yet';
}
