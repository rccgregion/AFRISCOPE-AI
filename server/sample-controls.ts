/**
 * Sample-data controls: dry-run, clear, restore.
 *
 * Clearing removes ONLY rows marked data_origin = 'sample', after taking a
 * snapshot and writing an audit entry. It refuses to run if any real row
 * depends on a sample row, so a partial delete can never strand live data.
 */
import type { Client, Database } from './db.js';
import { insert, seedDemo } from './seed.js';
import { importSamplePack } from './sample-pack.js';

export const CLEAR_CONFIRMATION = 'CLEAR SAMPLE DATA';

/** Tables that carry data_origin and hold sample-derived content. */
const ORIGIN_TABLES = [
  'operational_alerts',
  'recommendation_evidence',
  'evidence_records',
  'recommendations',
  'optimisation_scenarios',
  'intervention_options',
  'experiment_results',
  'experiment_runs',
  'experiments',
  'analytical_runs',
  'milestones',
  'action_items',
  'risk_assessments',
  'stakeholders',
  'problem_briefs',
  'deliveries',
  'procurement_events',
  'expenditure_records',
  'funding_releases',
  'budgets',
  'consumption_records',
  'inventory_records',
  'data_quality_results',
  'data_import_batches',
  'dataset_versions',
  'datasets',
  'medicine_products',
  'facilities',
] as const;

/** Child tables without a data_origin column, removed by sample project. */
const PROJECT_SCOPED_TABLES = ['approvals', 'reports'] as const;

export type OriginCounts = Record<string, { sample: number; real: number }>;

export type DryRun = {
  organisationId: string;
  sampleProjects: Array<{ id: string; title: string }>;
  counts: OriginCounts;
  totals: { sample: number; real: number };
  keepTotals: { sample: number; real: number };
  blockers: Array<{ table: string; reason: string; rows: number }>;
  canClear: boolean;
};

async function countByOrigin(c: Client, table: string, org: string) {
  const row = (
    await c.query(
      `select
         count(*) filter (where data_origin='sample')::int as sample,
         count(*) filter (where data_origin='real')::int as real
       from ${table} where organisation_id=$1`,
      [org],
    )
  ).rows[0] as { sample: number; real: number };
  return { sample: Number(row.sample), real: Number(row.real) };
}

export async function dryRunClear(db: Database, organisationId: string): Promise<DryRun> {
  return db.admin(async (c) => {
    const sampleProjects = (
      await c.query(
        "select id, title from projects where organisation_id=$1 and data_origin='sample' order by title",
        [organisationId],
      )
    ).rows.map((r) => ({ id: String(r.id), title: String(r.title) }));

    const counts: OriginCounts = {};
    let sampleTotal = 0;
    let realTotal = 0;
    for (const table of ORIGIN_TABLES) {
      const one = await countByOrigin(c, table, organisationId);
      counts[table] = one;
      sampleTotal += one.sample;
      realTotal += one.real;
    }

    // A real row that points at a sample row must stop the whole operation.
    const blockers: DryRun['blockers'] = [];
    const stockOnSampleFacility = (
      await c.query(
        `select count(*)::int as n from inventory_records i
           join facilities f on f.id = i.facility_id
          where i.organisation_id=$1 and i.data_origin='real' and f.data_origin='sample'`,
        [organisationId],
      )
    ).rows[0] as { n: number };
    if (Number(stockOnSampleFacility.n) > 0)
      blockers.push({
        table: 'inventory_records',
        reason: 'real stock rows reference a sample facility',
        rows: Number(stockOnSampleFacility.n),
      });

    const consumptionOnSampleFacility = (
      await c.query(
        `select count(*)::int as n from consumption_records i
           join facilities f on f.id = i.facility_id
          where i.organisation_id=$1 and i.data_origin='real' and f.data_origin='sample'`,
        [organisationId],
      )
    ).rows[0] as { n: number };
    if (Number(consumptionOnSampleFacility.n) > 0)
      blockers.push({
        table: 'consumption_records',
        reason: 'real consumption rows reference a sample facility',
        rows: Number(consumptionOnSampleFacility.n),
      });

    const realRecsOnSampleEvidence = (
      await c.query(
        `select count(*)::int as n from recommendations r
          where r.organisation_id=$1 and r.data_origin='real'
            and exists (
              select 1 from evidence_records e
               where e.data_origin='sample' and e.id::text in (
                 select jsonb_array_elements_text(coalesce(r.evidence_ids,'[]'::jsonb))
               )
            )`,
        [organisationId],
      )
    ).rows[0] as { n: number };
    if (Number(realRecsOnSampleEvidence.n) > 0)
      blockers.push({
        table: 'recommendations',
        reason: 'real recommendations cite sample evidence',
        rows: Number(realRecsOnSampleEvidence.n),
      });

    return {
      organisationId,
      sampleProjects,
      counts,
      totals: { sample: sampleTotal, real: realTotal },
      keepTotals: { sample: 0, real: realTotal },
      blockers,
      canClear: blockers.length === 0,
    };
  });
}

export type ClearResult = {
  cleared: boolean;
  deleted: OriginCounts;
  deletedTotal: number;
  snapshot: { id: string; filename: string; checksum: string } | null;
  auditId: string | null;
  reason?: string;
};

/**
 * Delete sample rows inside one transaction. Requires the exact confirmation
 * string; the caller is responsible for passing an already-authorised actor.
 */
export async function clearSampleData(
  db: Database,
  organisationId: string,
  projectIdForAudit: string,
  actorUserId: string,
  confirmation: string,
  snapshot: { id: string; filename: string; checksum: string } | null,
): Promise<ClearResult> {
  if (confirmation !== CLEAR_CONFIRMATION) {
    return {
      cleared: false,
      deleted: {},
      deletedTotal: 0,
      snapshot: null,
      auditId: null,
      reason: `Type "${CLEAR_CONFIRMATION}" exactly to confirm`,
    };
  }
  return db.admin(async (c) => {
    await c.query('select pg_advisory_xact_lock(729404)');
    const blockers = (
      await c.query(
        `select count(*)::int as n from inventory_records i
           join facilities f on f.id = i.facility_id
          where i.organisation_id=$1 and i.data_origin='real' and f.data_origin='sample'`,
        [organisationId],
      )
    ).rows[0] as { n: number };
    if (Number(blockers.n) > 0) {
      return {
        cleared: false,
        deleted: {},
        deletedTotal: 0,
        snapshot,
        auditId: null,
        reason: 'Aborted: real stock rows reference a sample facility. Reassign them first.',
      };
    }

    const deleted: OriginCounts = {};
    let total = 0;
    // Children before parents.
    for (const table of ORIGIN_TABLES) {
      const res = await c.query(
        `delete from ${table} where organisation_id=$1 and data_origin='sample'`,
        [organisationId],
      );
      const n = res.affectedRows ?? 0;
      deleted[table] = { sample: n, real: 0 };
      total += n;
    }
    const sampleProjectIds = (
      await c.query(
        "select id from projects where organisation_id=$1 and data_origin='sample'",
        [organisationId],
      )
    ).rows.map((r) => String(r.id));
    for (const table of PROJECT_SCOPED_TABLES) {
      for (const pid of sampleProjectIds) {
        const res = await c.query(`delete from ${table} where project_id=$1`, [pid]);
        const n = res.affectedRows ?? 0;
        deleted[table] = deleted[table] ?? { sample: 0, real: 0 };
        deleted[table].sample += n;
        total += n;
      }
    }
    const auditRow = await insert(c, 'audit_logs', {
      organisation_id: organisationId,
      project_id: projectIdForAudit,
      actor_id: actorUserId,
      action: 'sample_data.cleared',
      entity_type: 'organisation',
      entity_id: organisationId,
      before_state: null,
      after_state: {
        deleted: Object.fromEntries(
          Object.entries(deleted).map(([k, v]) => [k, v.sample]).filter(([, v]) => v),
        ),
        deleted_total: total,
        snapshot_id: snapshot?.id ?? null,
        snapshot_checksum: snapshot?.checksum ?? null,
      },
    }).catch(() => null);

    return {
      cleared: true,
      deleted,
      deletedTotal: total,
      snapshot,
      auditId: auditRow ? String((auditRow as { id: string }).id) : null,
    };
  });
}

/** Re-seed the sample pack idempotently (restore after clearing). */
export async function restoreSampleData(db: Database, actorUserId: string) {
  // Reset is restricted to data_origin='sample' rows, so real data imported by
  // a tenant is never deleted by a restore.
  await seedDemo(db, true, true);
  return importSamplePack(db, actorUserId);
}
