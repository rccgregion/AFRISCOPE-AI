/**
 * Clean real-data input path.
 *
 * Validation is strict and row-level: a row is either accepted or rejected with
 * a reason. Nothing is silently coerced — a bad date is rejected, not defaulted;
 * a missing source is rejected, not filled in; duplicates follow an explicit
 * per-batch policy.
 *
 * Stateless by design (serverless): /preview validates without writing, and
 * /commit re-validates the same upload before writing. Only the commit writes.
 */
import Papa from 'papaparse';
import type { Client } from './db.js';

export const FACILITY_FIELDS = [
  'facility_id',
  'facility_name',
  'country',
  'state_or_region',
  'district_or_lga',
  'facility_type',
  'catchment_population',
  'lat',
  'lon',
  'source',
] as const;

export const STOCK_FIELDS = [
  'facility_id',
  'medicine',
  'usable_stock_units',
  'avg_daily_consumption',
  'as_of_date',
  'financing_signal',
  'reporting_period',
  'source',
] as const;

export const REQUIRED_FACILITY_FIELDS = ['facility_id', 'facility_name', 'source'] as const;
export const REQUIRED_STOCK_FIELDS = [
  'facility_id',
  'medicine',
  'usable_stock_units',
  'avg_daily_consumption',
  'as_of_date',
  'source',
] as const;

export const DUPLICATE_POLICIES = ['skip', 'update', 'reject'] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

/** Country bounding boxes for a supplied coordinate sanity check. */
const COUNTRY_BOUNDS: Record<string, { lat: [number, number]; lon: [number, number] }> = {
  rwanda: { lat: [-2.9, -1.0], lon: [28.8, 30.9] },
  kenya: { lat: [-4.9, 5.1], lon: [33.9, 41.9] },
  ethiopia: { lat: [3.3, 14.9], lon: [32.9, 48.0] },
  nigeria: { lat: [4.2, 13.9], lon: [2.6, 14.7] },
  'south africa': { lat: [-35.0, -22.1], lon: [16.4, 32.9] },
};

export type RowRejection = { row: number; field?: string; reason: string };
export type RowWarning = { row: number; reason: string };

export type ValidFacility = {
  facility_id: string;
  facility_name: string;
  country: string | null;
  state_or_region: string | null;
  district_or_lga: string | null;
  facility_type: string | null;
  catchment_population: number | null;
  lat: number | null;
  lon: number | null;
  source: string;
};

export type ValidStock = {
  facility_id: string;
  medicine: string;
  usable_stock_units: number;
  avg_daily_consumption: number;
  coverage_days: number | null;
  as_of_date: string;
  financing_signal: string | null;
  reporting_period: string | null;
  source: string;
};

export type ValidationResult<T> = {
  accepted: T[];
  rejections: RowRejection[];
  warnings: RowWarning[];
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function rowsOf(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
}

function textOf(row: Record<string, string>, field: string): string {
  return (row[field] ?? '').toString().trim();
}

/** coverage_days is always derived: usable / average daily consumption. */
export function deriveCoverage(usable: number, avgDaily: number): number | null {
  if (!Number.isFinite(usable) || !Number.isFinite(avgDaily) || avgDaily <= 0) return null;
  return Math.round((usable / avgDaily) * 100) / 100;
}

export function validateFacilitiesCsv(
  csv: string,
  now: Date = new Date(),
): ValidationResult<ValidFacility> {
  void now;
  const accepted: ValidFacility[] = [];
  const rejections: RowRejection[] = [];
  const warnings: RowWarning[] = [];
  const seenIds = new Set<string>();
  const seenCoords = new Map<string, string>();

  rowsOf(csv).forEach((raw, index) => {
    const row = index + 2;
    const id = textOf(raw, 'facility_id');
    const name = textOf(raw, 'facility_name');
    const source = textOf(raw, 'source');
    if (!id)
      return rejections.push({ row, field: 'facility_id', reason: 'facility_id is required' });
    if (!name)
      return rejections.push({ row, field: 'facility_name', reason: 'facility_name is required' });
    if (!source)
      return rejections.push({
        row,
        field: 'source',
        reason: 'source is required (name the registry, report or system the row came from)',
      });
    if (seenIds.has(id))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `duplicate facility_id "${id}" within the file`,
      });

    const country = textOf(raw, 'country');
    const catchmentRaw = textOf(raw, 'catchment_population');
    let catchment: number | null = null;
    if (catchmentRaw) {
      const value = Number(catchmentRaw);
      if (!Number.isFinite(value) || value < 0)
        return rejections.push({
          row,
          field: 'catchment_population',
          reason: 'catchment_population must be a number >= 0',
        });
      catchment = value;
    }

    const latRaw = textOf(raw, 'lat');
    const lonRaw = textOf(raw, 'lon');
    let lat: number | null = null;
    let lon: number | null = null;
    if (latRaw !== '' || lonRaw !== '') {
      if (latRaw === '' || lonRaw === '')
        return rejections.push({
          row,
          field: 'lat',
          reason: 'provide both lat and lon, or neither',
        });
      lat = Number(latRaw);
      lon = Number(lonRaw);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90)
        return rejections.push({ row, field: 'lat', reason: 'lat must be between -90 and 90' });
      if (!Number.isFinite(lon) || lon < -180 || lon > 180)
        return rejections.push({ row, field: 'lon', reason: 'lon must be between -180 and 180' });
      const bounds = COUNTRY_BOUNDS[country.toLowerCase()];
      if (bounds) {
        const inside =
          lat >= bounds.lat[0] &&
          lat <= bounds.lat[1] &&
          lon >= bounds.lon[0] &&
          lon <= bounds.lon[1];
        if (!inside)
          rejections.push({
            row,
            field: 'lat',
            reason: `coordinates fall outside ${country}`,
          });
        if (!inside) return;
      }
      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      const other = seenCoords.get(key);
      if (other)
        warnings.push({
          row,
          reason: `identical coordinates to facility "${other}" — verify these are distinct sites`,
        });
      else seenCoords.set(key, id);
    }

    seenIds.add(id);
    accepted.push({
      facility_id: id,
      facility_name: name,
      country: country || null,
      state_or_region: textOf(raw, 'state_or_region') || null,
      district_or_lga: textOf(raw, 'district_or_lga') || null,
      facility_type: textOf(raw, 'facility_type') || null,
      catchment_population: catchment,
      lat,
      lon,
      source,
    });
  });
  return { accepted, rejections, warnings };
}

export function validateStockCsv(
  csv: string,
  knownFacilityIds: Set<string>,
  now: Date = new Date(),
): ValidationResult<ValidStock> {
  const accepted: ValidStock[] = [];
  const rejections: RowRejection[] = [];
  const warnings: RowWarning[] = [];
  const seen = new Set<string>();
  const today = now.toISOString().slice(0, 10);

  rowsOf(csv).forEach((raw, index) => {
    const row = index + 2;
    const facilityId = textOf(raw, 'facility_id');
    const medicine = textOf(raw, 'medicine');
    const source = textOf(raw, 'source');
    if (!facilityId)
      return rejections.push({ row, field: 'facility_id', reason: 'facility_id is required' });
    if (!medicine)
      return rejections.push({ row, field: 'medicine', reason: 'medicine is required' });
    if (!source)
      return rejections.push({
        row,
        field: 'source',
        reason: 'source is required (name the registry, report or system the row came from)',
      });
    if (!knownFacilityIds.has(facilityId))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `unknown facility_id "${facilityId}" — include the facility file in the same batch`,
      });

    const usableRaw = textOf(raw, 'usable_stock_units');
    const usable = Number(usableRaw);
    if (usableRaw === '' || !Number.isFinite(usable) || usable < 0)
      return rejections.push({
        row,
        field: 'usable_stock_units',
        reason: 'usable_stock_units must be a number >= 0',
      });

    const avgRaw = textOf(raw, 'avg_daily_consumption');
    const avg = Number(avgRaw);
    if (avgRaw === '' || !Number.isFinite(avg) || avg < 0)
      return rejections.push({
        row,
        field: 'avg_daily_consumption',
        reason: 'avg_daily_consumption must be a number >= 0',
      });

    const asOf = textOf(raw, 'as_of_date');
    if (!isoDate.test(asOf) || Number.isNaN(Date.parse(asOf)))
      return rejections.push({
        row,
        field: 'as_of_date',
        reason: 'as_of_date must be a valid YYYY-MM-DD date',
      });
    if (asOf > today)
      return rejections.push({
        row,
        field: 'as_of_date',
        reason: 'as_of_date cannot be in the future',
      });

    const key = `${facilityId}|${medicine.toLowerCase()}|${asOf}`;
    if (seen.has(key))
      return rejections.push({
        row,
        field: 'facility_id',
        reason: `duplicate (facility_id, medicine, as_of_date) "${key}"`,
      });
    seen.add(key);

    const coverage = deriveCoverage(usable, avg);
    if (coverage === null)
      warnings.push({
        row,
        reason: 'avg_daily_consumption is 0, so coverage_days cannot be computed',
      });

    accepted.push({
      facility_id: facilityId,
      medicine,
      usable_stock_units: usable,
      avg_daily_consumption: avg,
      coverage_days: coverage,
      as_of_date: asOf,
      financing_signal: textOf(raw, 'financing_signal') || null,
      reporting_period: textOf(raw, 'reporting_period') || null,
      source,
    });
  });
  return { accepted, rejections, warnings };
}

/** CSV templates. Deliberately contain no facility-shaped example values. */
export function facilityTemplateCsv(): string {
  const header = FACILITY_FIELDS.join(',');
  const example = [
    'YOUR-FACILITY-ID',
    'Your facility name',
    'Your country',
    'Your state or region',
    'Your district or LGA',
    'Primary Health Centre',
    '',
    '',
    '',
    'Name of registry, report or system this row came from',
  ].join(',');
  return `${header}\r\n${example}\r\n`;
}

export function stockTemplateCsv(): string {
  const header = STOCK_FIELDS.join(',');
  const example = [
    'YOUR-FACILITY-ID',
    'Medicine name',
    '0',
    '0',
    new Date().toISOString().slice(0, 10),
    'Optional financing signal',
    'e.g. 2026-Q3',
    'Name of registry, report or system this row came from',
  ].join(',');
  return `${header}\r\n${example}\r\n`;
}

/** Field documentation reused by the XLSX data-dictionary sheet and the docs. */
export const DATA_DICTIONARY: Record<
  'facilities' | 'stock',
  Array<{ field: string; required: boolean; description: string }>
> = {
  facilities: [
    {
      field: 'facility_id',
      required: true,
      description: 'Stable identifier, unique within the file',
    },
    {
      field: 'facility_name',
      required: true,
      description: 'Facility name as published by the source',
    },
    { field: 'country', required: false, description: 'Country name; must match the coordinates' },
    { field: 'state_or_region', required: false, description: 'State or region' },
    { field: 'district_or_lga', required: false, description: 'District or LGA' },
    { field: 'facility_type', required: false, description: 'Facility type' },
    {
      field: 'catchment_population',
      required: false,
      description: 'Catchment population, number >= 0',
    },
    {
      field: 'lat',
      required: false,
      description: 'Latitude, -90..90; supply with lon or not at all',
    },
    { field: 'lon', required: false, description: 'Longitude, -180..180' },
    {
      field: 'source',
      required: true,
      description: 'Registry, report or system the row came from',
    },
  ],
  stock: [
    { field: 'facility_id', required: true, description: 'Must exist in the workspace or batch' },
    { field: 'medicine', required: true, description: 'Medicine name' },
    {
      field: 'usable_stock_units',
      required: true,
      description: 'Usable units, number >= 0 (exclude expired/unusable stock)',
    },
    {
      field: 'avg_daily_consumption',
      required: true,
      description: 'Average daily consumption, number >= 0',
    },
    {
      field: 'as_of_date',
      required: true,
      description: 'YYYY-MM-DD; cannot be in the future',
    },
    { field: 'financing_signal', required: false, description: 'Optional financing signal text' },
    { field: 'reporting_period', required: false, description: 'Reporting period label' },
    {
      field: 'source',
      required: true,
      description: 'Registry, report or system the row came from',
    },
  ],
};

/** Insert validated facilities + stock for a batch. Caller supplies the tx. */
export async function writeBatch(
  c: Client,
  args: {
    organisationId: string;
    projectId: string;
    actorId: string;
    batchId: string;
    versionId: string;
    facilities: ValidFacility[];
    stock: ValidStock[];
    duplicatePolicy: DuplicatePolicy;
  },
): Promise<{ facilitiesWritten: number; stockWritten: number; skipped: number }> {
  const facilityIds = new Map<string, string>();
  const existing = await c.query('select id, external_id from facilities where project_id=$1', [
    args.projectId,
  ]);
  for (const row of existing.rows) facilityIds.set(String(row.external_id), String(row.id));

  let facilitiesWritten = 0;
  for (const f of args.facilities) {
    const res = await c.query(
      `insert into facilities
         (organisation_id, project_id, created_by, external_id, name, country, region, district,
          facility_type, latitude, longitude, source, import_batch_id, data_origin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'real')
       on conflict (project_id, external_id) do update set
         name=excluded.name, country=excluded.country, region=excluded.region,
         district=excluded.district, facility_type=excluded.facility_type,
         latitude=excluded.latitude, longitude=excluded.longitude, source=excluded.source,
         import_batch_id=excluded.import_batch_id
       returning id`,
      [
        args.organisationId,
        args.projectId,
        args.actorId,
        f.facility_id,
        f.facility_name,
        f.country ?? 'Unspecified',
        f.state_or_region ?? 'Unspecified',
        f.district_or_lga ?? 'Unspecified',
        f.facility_type ?? 'Unknown',
        f.lat,
        f.lon,
        f.source,
        args.batchId,
      ],
    );
    facilityIds.set(f.facility_id, String(res.rows[0].id));
    facilitiesWritten += 1;
  }

  const productIds = new Map<string, string>();
  for (const name of [...new Set(args.stock.map((s) => s.medicine))]) {
    const res = await c.query(
      `insert into medicine_products
         (organisation_id, project_id, created_by, external_id, name, unit, data_origin)
       values ($1,$2,$3,$4,$5,'units','real')
       on conflict (project_id, external_id) do update set name=excluded.name
       returning id`,
      [
        args.organisationId,
        args.projectId,
        args.actorId,
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
      ],
    );
    productIds.set(name, String(res.rows[0].id));
  }

  let stockWritten = 0;
  let skipped = 0;
  let stockRowIndex = 0;
  for (const s of args.stock) {
    stockRowIndex += 1;
    const facilityId = facilityIds.get(s.facility_id);
    const productId = productIds.get(s.medicine);
    if (!facilityId || !productId) {
      skipped += 1;
      continue;
    }
    // usable_stock/opening/closing are integers in the schema; round explicitly
    // and never invent consumption when it is zero.
    const units = Math.round(s.usable_stock_units);
    if (args.duplicatePolicy !== 'reject') {
      const dup = await c.query(
        `select id from inventory_records
          where project_id=$1 and facility_id=$2 and product_id=$3 and reporting_date=$4`,
        [args.projectId, facilityId, productId, s.as_of_date],
      );
      if (dup.rows[0]) {
        if (args.duplicatePolicy === 'skip') {
          skipped += 1;
          continue;
        }
        await c.query('delete from inventory_records where id=$1', [dup.rows[0].id]);
      }
    }
    await c.query(
      `insert into inventory_records
         (organisation_id, project_id, created_by, version_id, facility_id, product_id,
          reporting_date, opening_stock, quantity_received, quantity_dispensed, adjustments,
          closing_stock, usable_stock, reserved_stock, expired_stock, stockout_days,
          minimum_stock, maximum_stock, source_row, quality_status, avg_daily_consumption,
          coverage_days, financing_signal, source, import_batch_id, data_origin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,$8,$8,0,0,0,0,$8,$9,'Validated',$10,$11,$12,$13,$14,'real')`,
      [
        args.organisationId,
        args.projectId,
        args.actorId,
        args.versionId,
        facilityId,
        productId,
        s.as_of_date,
        units,
        stockRowIndex,
        s.avg_daily_consumption,
        s.coverage_days,
        s.financing_signal,
        s.source,
        args.batchId,
      ],
    );
    stockWritten += 1;
  }
  return { facilitiesWritten, stockWritten, skipped };
}
