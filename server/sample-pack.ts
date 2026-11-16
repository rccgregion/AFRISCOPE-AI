/**
 * Sample content pack importer.
 *
 * Loads data/sample/*.csv into a dedicated demonstration project through the
 * same validation discipline as the user-facing importer: every row is checked,
 * rejections are reported rather than coerced, and nothing is written unless the
 * whole file validates.
 *
 * Rules enforced here (see TASK 2 Part A):
 *  - every sample facility name is prefixed "[Sample] ";
 *  - facility_id values are preserved so stock rows stay linked;
 *  - latitude/longitude are stored as NULL (approximate coordinates are not
 *    presented as verified locations);
 *  - unverifiable note fragments are stripped;
 *  - coverage_days is always computed from usable_stock / avg_daily_consumption
 *    and any supplied value that disagrees is flagged, never trusted;
 *  - Mwulire Health Center is created as the single data_origin='real'
 *    facility with no stock and no financing signals, and the stock rows that
 *    named it in the source file are re-attached to a synthetic facility
 *    (RW-SMP-001) so invented stock is never shown against a real facility.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { DEMO_ORG } from '../shared/domain.js';
import type { Client, Database } from './db.js';
import { insert, insertOnce } from './seed.js';

export const SAMPLE_PROJECT_TITLE =
  'Medicine Availability, Financing Visibility & Decision Support - Rwanda focus with multi-country context (Kenya, Ethiopia, Nigeria, South Africa)';
export const SAMPLE_PREFIX = '[Sample] ';
export const SAMPLE_LABEL = 'Sample data - not reported by any facility';
/** Prefix applied to sample facility names so the label travels with the name. */
export const SAMPLE_NAME_PREFIX = '[Sample] ';
export const SIMULATED_ALERT_PREFIX = 'Simulated:';
export const REAL_FACILITY_EXTERNAL_ID = 'RW-MWU-001';
export const DERIVED_FACILITY_EXTERNAL_ID = 'RW-SMP-001';
export const DERIVED_FACILITY_NAME = SAMPLE_PREFIX + 'Rwamagana PHC 1';
/** Facility names that appear in the source file but must be rendered as sample. */
const SAMPLE_OVERRIDE_NAMES: Record<string, string> = {
  'RW-RWG-003': SAMPLE_PREFIX + 'Rwamagana District Hospital',
};
/**
 * Fragments that assert unverifiable facts about a real place. They are
 * removed rather than repeated, and the remainder of the note is kept so the
 * topical context is not lost.
 */
const UNVERIFIABLE_FRAGMENTS = [
  /recently upgraded/gi,
  /close to federal financing flows/gi,
];

export type Rejection = { row: number; field?: string; reason: string };
export type Warning_ = { row: number; reason: string };

export type FacilityRow = {
  external_id: string;
  name: string;
  country: string;
  district: string;
  facility_type: string;
  catchment_population: number | null;
  notes: string | null;
};

export type StockRow = {
  external_id: string;
  medicine: string;
  usable: number;
  avg_daily: number;
  supplied_coverage: number | null;
  coverage: number | null;
  coverage_mismatch: boolean;
  risk_level: string;
  financing_signal: string;
  as_of: string;
  source_row: number;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function neutraliseNote(note: string | null | undefined): string | null {
  if (!note) return null;
  let out = note;
  for (const fragment of UNVERIFIABLE_FRAGMENTS) out = out.replace(fragment, '');
  out = out
    .replace(/;\s*;/g, ';')
    .replace(/^[\s;,-]+|[\s;,-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out.length ? out : null;
}

/** coverage_days is derived, never read from input. */
export function computeCoverage(usable: number, avgDaily: number): number | null {
  if (!Number.isFinite(usable) || !Number.isFinite(avgDaily) || avgDaily <= 0) return null;
  return Math.round((usable / avgDaily) * 100) / 100;
}

export function parseFacilities(csv: string): {
  accepted: FacilityRow[];
  rejections: Rejection[];
} {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const accepted: FacilityRow[] = [];
  const rejections: Rejection[] = [];
  const seen = new Set<string>();
  parsed.data.forEach((raw, i) => {
    const row = i + 2; // header is line 1
    const id = (raw.facility_id || '').trim();
    const name = (raw.facility_name || '').trim();
    if (!id) return rejections.push({ row, field: 'facility_id', reason: 'facility_id is required' });
    if (!name)
      return rejections.push({ row, field: 'facility_name', reason: 'facility_name is required' });
    if (seen.has(id))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `duplicate facility_id "${id}" within the file`,
      });
    const lat = raw.lat?.trim();
    const lon = raw.lon?.trim();
    if (lat) {
      const v = Number(lat);
      if (!Number.isFinite(v) || v < -90 || v > 90)
        return rejections.push({ row, field: 'lat', reason: 'lat must be between -90 and 90' });
    }
    if (lon) {
      const v = Number(lon);
      if (!Number.isFinite(v) || v < -180 || v > 180)
        return rejections.push({ row, field: 'lon', reason: 'lon must be between -180 and 180' });
    }
    const catchment = raw.catchment_population?.trim();
    let catchmentValue: number | null = null;
    if (catchment) {
      const v = Number(catchment);
      if (!Number.isFinite(v) || v < 0)
        return rejections.push({
          row,
          field: 'catchment_population',
          reason: 'catchment_population must be a number >= 0',
        });
      catchmentValue = v;
    }
    seen.add(id);
    const isReal = id === REAL_FACILITY_EXTERNAL_ID;
    accepted.push({
      external_id: id,
      // Real facility keeps its own name; every sample row is prefixed.
      name: isReal ? name : SAMPLE_OVERRIDE_NAMES[id] || SAMPLE_PREFIX + name,
      country: (raw.country || '').trim(),
      district: (raw.district_or_lga || '').trim(),
      facility_type: (raw.facility_type || '').trim() || 'Unknown',
      catchment_population: catchmentValue,
      notes: neutraliseNote(raw.notes),
    });
  });
  return { accepted, rejections };
}

export function parseStock(
  csv: string,
  knownFacilityIds: Set<string>,
  now: Date = new Date(),
): { accepted: StockRow[]; rejections: Rejection[]; warnings: Warning_[] } {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const accepted: StockRow[] = [];
  const rejections: Rejection[] = [];
  const warnings: Warning_[] = [];
  const seen = new Set<string>();
  const today = now.toISOString().slice(0, 10);

  parsed.data.forEach((raw, i) => {
    const row = i + 2;
    const id = (raw.facility_id || '').trim();
    const medicine = (raw.medicine || '').trim();
    if (!id) return rejections.push({ row, field: 'facility_id', reason: 'facility_id is required' });
    if (!medicine)
      return rejections.push({ row, field: 'medicine', reason: 'medicine is required' });
    if (!knownFacilityIds.has(id))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `unknown facility_id "${id}" (not present in the facility file)`,
      });

    const usable = Number((raw.usable_stock_units || '').trim());
    if (!Number.isFinite(usable) || usable < 0)
      return rejections.push({
        row,
        field: 'usable_stock_units',
        reason: 'usable_stock_units must be a number >= 0',
      });
    const avgDaily = Number((raw.avg_daily_consumption || '').trim());
    if (!Number.isFinite(avgDaily) || avgDaily < 0)
      return rejections.push({
        row,
        field: 'avg_daily_consumption',
        reason: 'avg_daily_consumption must be a number >= 0',
      });

    const asOf = (raw.last_signal_date || '').trim();
    if (!isoDate.test(asOf) || Number.isNaN(Date.parse(asOf)))
      return rejections.push({
        row,
        field: 'last_signal_date',
        reason: 'last_signal_date must be a valid YYYY-MM-DD date',
      });
    if (asOf > today)
      warnings.push({ row, reason: `last_signal_date ${asOf} is in the future; stored as supplied` });

    const key = `${id}|${medicine.toLowerCase()}|${asOf}`;
    if (seen.has(key))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `duplicate (facility_id, medicine, last_signal_date) "${key}"`,
      });
    seen.add(key);

    const coverage = computeCoverage(usable, avgDaily);
    if (coverage === null)
      warnings.push({
        row,
        reason: 'avg_daily_consumption is 0, so coverage_days cannot be computed (stored NULL)',
      });
    const suppliedRaw = (raw.coverage_days || '').trim();
    const supplied = suppliedRaw === '' ? null : Number(suppliedRaw);
    const mismatch =
      supplied !== null &&
      Number.isFinite(supplied) &&
      coverage !== null &&
      Math.abs(supplied - coverage) > 1;
    if (mismatch)
      warnings.push({
        row,
        reason: `supplied coverage_days ${supplied} disagrees with computed ${coverage}; computed value kept`,
      });

    accepted.push({
      external_id: id,
      medicine,
      usable,
      avg_daily: avgDaily,
      supplied_coverage: Number.isFinite(supplied as number) ? (supplied as number) : null,
      coverage,
      coverage_mismatch: mismatch,
      risk_level: (raw.risk_level || '').trim() || 'Unknown',
      financing_signal: (raw.financing_signal || '').trim() || 'Not reported',
      as_of: asOf,
      source_row: row,
    });
  });
  return { accepted, rejections, warnings };
}

/** Facility ids in the stock file are re-pointed where a real facility must not
 * carry invented stock. */
export function resolveStockFacilityId(externalId: string): string {
  return externalId === REAL_FACILITY_EXTERNAL_ID ? DERIVED_FACILITY_EXTERNAL_ID : externalId;
}

export type SamplePackReport = {
  created: boolean;
  projectId: string | null;
  facilities: number;
  realFacilities: number;
  stockRows: number;
  alerts: number;
  rejections: Rejection[];
  warnings: Warning_[];
  derivedFacilityId: string;
  batchId: string | null;
};

function readCsv(name: string): string {
  // The sample pack ships inside public/demo so it is included in the Vercel
  // function bundle (vercel.json includeFiles) and also downloadable; the
  // data/sample copy is used when running from a working checkout that has it.
  for (const dir of ['public/demo', 'data/sample']) {
    const path = resolve(dir, name);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error(`Sample pack file ${name} is missing from this deployment`);
}

/**
 * Import the sample pack. Idempotent: if the project already exists it returns
 * its current row counts and writes nothing.
 */
export async function importSamplePack(
  db: Database,
  actorUserId: string,
): Promise<SamplePackReport> {
  const facilitiesCsv = parseFacilities(readCsv('sample_facilities.csv'));
  const knownIds = new Set(facilitiesCsv.accepted.map((f) => f.external_id));
  const stockCsvText = readCsv('sample_stock_signals.csv');
  const stock = parseStock(stockCsvText, knownIds);

  if (facilitiesCsv.rejections.length || stock.rejections.length) {
    // Nothing is written when any row is invalid: the caller reports and fixes.
    return {
      created: false,
      projectId: null,
      facilities: 0,
      realFacilities: 0,
      stockRows: 0,
      alerts: 0,
      rejections: [...facilitiesCsv.rejections, ...stock.rejections],
      warnings: stock.warnings,
      derivedFacilityId: DERIVED_FACILITY_EXTERNAL_ID,
      batchId: null,
    };
  }

  return db.admin(async (c) => {
    await c.query('select pg_advisory_xact_lock(729403)');
    const existing = (
      await c.query('select id from projects where title=$1 and organisation_id=$2', [
        SAMPLE_PROJECT_TITLE,
        DEMO_ORG,
      ])
    ).rows[0];

    // Already populated -> nothing to do. Present but empty (e.g. after
    // "Clear sample data") -> repopulate, which is what restore needs.
    if (existing) {
      const id = String(existing.id);
      const counts = await packCounts(c, id);
      if (counts.facilities > 0 || counts.stockRows > 0) {
        return {
          created: false,
          projectId: id,
          ...counts,
          rejections: [],
          warnings: stock.warnings,
          derivedFacilityId: DERIVED_FACILITY_EXTERNAL_ID,
          batchId: null,
        };
      }
    }

    const project =
      existing ??
      (await insert(c, 'projects', {
        organisation_id: DEMO_ORG,
        title: SAMPLE_PROJECT_TITLE,
        sector: 'Public health',
        countries: 'Rwanda, Kenya, Ethiopia, Nigeria, South Africa',
        description:
          'Medicine availability, financing visibility and decision support. Sample stock and financing signals are synthetic and not reported by any facility. Mwulire Health Center is listed as a real facility with no stock or financing data.',
        settings: { stock_threshold_days: 21, as_of: '2026-10-29' },
        created_by: actorUserId,
        data_origin: 'sample',
      }));
    const projectId = String(project.id);

    const batch = await insert(c, 'data_import_batches', {
      organisation_id: DEMO_ORG,
      project_id: projectId,
      created_by: actorUserId,
      batch_kind: 'sample_pack',
      data_origin: 'sample',
      file_name: 'sample_facilities.csv + sample_stock_signals.csv',
      source: 'data/sample (synthetic sample pack)',
      row_counts: { facilities: facilitiesCsv.accepted.length, stock: stock.accepted.length },
      notes: 'Sample content pack imported through the validation pipeline',
    });
    const batchId = String(batch.id);

    const dataset = await insert(c, 'datasets', {
      organisation_id: DEMO_ORG,
      project_id: projectId,
      created_by: actorUserId,
      name: 'Sample pack · stock and financing signals',
      kind: 'inventory',
      description:
        'Synthetic sample pack. Facility names are prefixed [Sample]; all quantities and financing signals are invented for demonstration and are not reported by any facility.',
      source: 'data/sample/sample_stock_signals.csv',
      owner: 'AfriScope demonstration data steward',
      sensitivity: 'Synthetic',
      quality_status: stock.warnings.length ? 'Issues found' : 'Validated',
      lineage: 'Sample CSV → strict validation → relational import',
      data_origin: 'sample',
    });
    const version = await insert(c, 'dataset_versions', {
      organisation_id: DEMO_ORG,
      project_id: projectId,
      created_by: actorUserId,
      dataset_id: dataset.id,
      version: 1,
      row_count: stock.accepted.length,
      checksum: String(stock.accepted.length) + '-sample-pack',
      period_start: stock.accepted.map((r) => r.as_of).sort()[0] ?? null,
      period_end: stock.accepted.map((r) => r.as_of).sort().at(-1) ?? null,
      notes: `${stock.rejections.length} rejected, ${stock.warnings.length} warnings`,
    });

    const facilityIds = new Map<string, string>();
    for (const f of facilitiesCsv.accepted) {
      const isReal = f.external_id === REAL_FACILITY_EXTERNAL_ID;
      const row = await insertOnce(
        c,
        'facilities',
        {
        organisation_id: DEMO_ORG,
        project_id: projectId,
        created_by: actorUserId,
        external_id: f.external_id,
        name: f.name,
        country: f.country || 'Unspecified',
        region: f.district || 'Unspecified',
        district: f.district || 'Unspecified',
        facility_type: f.facility_type,
        latitude: null,
        longitude: null,
        notes: f.notes,
        source: isReal ? 'Verified content pack' : 'Sample pack (synthetic)',
        import_batch_id: batchId,
        data_origin: isReal ? 'real' : 'sample',
        },
        ['project_id', 'external_id'],
      );
      facilityIds.set(f.external_id, String(row.id));
      if (isReal) {
        // A real facility carries no invented stock, so give it no stock rows
        // below: stock that named it in the source file is re-pointed.
        continue;
      }
    }
    // Synthetic facility that absorbs the stock rows which named the real site.
    const derived = await insertOnce(
      c,
      'facilities',
      {
      organisation_id: DEMO_ORG,
      project_id: projectId,
      created_by: actorUserId,
      external_id: DERIVED_FACILITY_EXTERNAL_ID,
      name: DERIVED_FACILITY_NAME,
      country: 'Rwanda',
      region: 'Rwamagana',
      district: 'Rwamagana',
      facility_type: 'Primary Health Center',
      latitude: null,
      longitude: null,
      notes:
        'Synthetic facility created so sample stock rows do not appear against the real Mwulire Health Center.',
      source: 'Sample pack (synthetic)',
      import_batch_id: batchId,
      data_origin: 'sample',
      },
      ['project_id', 'external_id'],
    );
    facilityIds.set(DERIVED_FACILITY_EXTERNAL_ID, String(derived.id));

    const productIds = new Map<string, string>();
    for (const name of [...new Set(stock.accepted.map((r) => r.medicine))]) {
      const p = await insertOnce(
        c,
        'medicine_products',
        {
        organisation_id: DEMO_ORG,
        project_id: projectId,
        created_by: actorUserId,
        external_id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        unit: 'units',
        data_origin: 'sample',
        },
        ['project_id', 'external_id'],
      );
      productIds.set(name, String(p.id));
    }

    let alerts = 0;
    for (const r of stock.accepted) {
      const facilityId = facilityIds.get(resolveStockFacilityId(r.external_id));
      const productId = productIds.get(r.medicine);
      if (!facilityId || !productId) continue;
      await insert(c, 'inventory_records', {
        organisation_id: DEMO_ORG,
        project_id: projectId,
        created_by: actorUserId,
        version_id: version.id,
        facility_id: facilityId,
        product_id: productId,
        reporting_date: r.as_of,
        opening_stock: r.usable,
        quantity_received: 0,
        quantity_dispensed: Math.round(r.avg_daily * 7),
        adjustments: 0,
        closing_stock: r.usable,
        usable_stock: r.usable,
        reserved_stock: 0,
        expired_stock: 0,
        stockout_days: 0,
        minimum_stock: 0,
        maximum_stock: r.usable,
        source_row: r.source_row,
        country: facilitiesCsv.accepted.find((f) => f.external_id === r.external_id)?.country,
        supplier: null,
        quality_status: 'Synthetic sample',
        avg_daily_consumption: r.avg_daily,
        coverage_days: r.coverage,
        supplied_coverage_days: r.supplied_coverage,
        coverage_mismatch: r.coverage_mismatch,
        risk_level: r.risk_level,
        financing_signal: r.financing_signal,
        last_signal_date: r.as_of,
        source: 'Sample pack (synthetic)',
        import_batch_id: batchId,
        data_origin: 'sample',
      });
      // High/Critical coverage becomes an alert whose text always starts with
      // "Simulated:" so it can never be mistaken for a reported event.
      if (r.risk_level === 'High' || r.risk_level === 'Critical') {
        // Resolve the name through the SAME re-pointing used for the stock row:
        // an alert about synthetic stock must never name a real facility.
        const stockFacilityId = resolveStockFacilityId(r.external_id);
        const facilityName =
          stockFacilityId === DERIVED_FACILITY_EXTERNAL_ID
            ? DERIVED_FACILITY_NAME
            : (facilitiesCsv.accepted.find((f) => f.external_id === r.external_id)?.name ??
              r.external_id);
        await insertOnce(
          c,
          'operational_alerts',
          {
          organisation_id: DEMO_ORG,
          project_id: projectId,
          created_by: actorUserId,
          category: 'Stock',
          severity: r.risk_level === 'Critical' ? 'High' : 'Medium',
          title: `${SIMULATED_ALERT_PREFIX} ${r.medicine} coverage ${r.coverage ?? 'unknown'} days at ${facilityName}`,
          triggering_condition: `${SIMULATED_ALERT_PREFIX} computed coverage_days ${r.coverage ?? 'n/a'} <= 21 (sample pack row ${r.source_row})`,
          source_records: [],
          recommended_action:
            'Review with the facility and district manager. Sample data only - not reported by any facility.',
          dedupe_key: `sample-${r.external_id}-${r.medicine}-${r.as_of}`,
          data_origin: 'sample',
          },
          ['project_id', 'dedupe_key'],
        );
        alerts += 1;
      }
    }

    const counts = await packCounts(c, projectId);
    return {
      created: true,
      projectId,
      ...counts,
      alerts,
      rejections: [],
      warnings: stock.warnings,
      derivedFacilityId: DERIVED_FACILITY_EXTERNAL_ID,
      batchId,
    };
  });
}

async function packCounts(c: Client, projectId: string) {
  const row = (
    await c.query(
      `select
         (select count(*)::int from facilities where project_id=$1 and data_origin='sample') as facilities,
         (select count(*)::int from facilities where project_id=$1 and data_origin='real') as real_facilities,
         (select count(*)::int from inventory_records where project_id=$1 and data_origin='sample') as stock_rows,
         (select count(*)::int from operational_alerts where project_id=$1 and data_origin='sample') as alerts`,
      [projectId],
    )
  ).rows[0] as Record<string, number>;
  return {
    facilities: Number(row.facilities),
    realFacilities: Number(row.real_facilities),
    stockRows: Number(row.stock_rows),
    alerts: Number(row.alerts),
  };
}
