import { z } from 'zod';
export const uuid = z.string().uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    'Invalid calendar date',
  );
export const text = z.string().trim().min(1).max(5000);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,32}$/,
    'Use 3–32 lowercase letters, numbers, dots, underscores or hyphens; start with a letter or number',
  );
export const quantity = z.number().int().min(0).max(100000000);
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const projectSchema = z.object({
  title: text.max(160),
  sector: z.enum(['Public health', 'Public finance', 'Development programmes', 'Cross-sector']),
  countries: text.max(300),
  description: z.string().max(5000).default(''),
  organisation_id: uuid,
});
export const inventoryFields = [
  'country',
  'region',
  'district',
  'facility_id',
  'facility_type',
  'product_id',
  'medicine_name',
  'unit',
  'reporting_date',
  'opening_stock',
  'quantity_received',
  'quantity_dispensed',
  'adjustments',
  'closing_stock',
  'usable_stock',
  'reserved_stock',
  'expired_stock',
  'stockout_days',
  'supplier',
  'expected_delivery_date',
  'delivery_lead_time_days',
  'batch_identifier',
  'expiry_date',
  'minimum_stock',
  'maximum_stock',
  'data_source',
  'data_quality_status',
] as const;
export const financeFields: Record<string, string[]> = {
  budgets: [
    'external_id',
    'programme_code',
    'programme_name',
    'funding_source',
    'currency',
    'period',
    'amount',
    'geography',
  ],
  funding_releases: [
    'external_id',
    'budget_id',
    'currency',
    'amount',
    'due_date',
    'released_date',
    'status',
    'period',
  ],
  procurement_events: [
    'external_id',
    'programme_code',
    'title',
    'stage',
    'currency',
    'amount',
    'started_date',
    'due_date',
    'completed_date',
    'expected_days',
    'supplier',
    'approval_reference',
  ],
  expenditure_records: [
    'external_id',
    'programme_code',
    'budget_id',
    'event_type',
    'currency',
    'amount',
    'transaction_date',
    'period',
    'reference',
    'description',
  ],
};
export const requiredFields: Record<string, string[]> = {
  inventory: [
    'facility_id',
    'product_id',
    'unit',
    'reporting_date',
    'opening_stock',
    'quantity_received',
    'quantity_dispensed',
    'adjustments',
    'closing_stock',
    'usable_stock',
    'reserved_stock',
    'expired_stock',
    'stockout_days',
    'expiry_date',
    'minimum_stock',
    'maximum_stock',
  ],
  budgets: ['external_id', 'programme_code', 'programme_name', 'currency', 'period', 'amount'],
  funding_releases: [
    'external_id',
    'budget_id',
    'currency',
    'amount',
    'due_date',
    'status',
    'period',
  ],
  procurement_events: [
    'external_id',
    'programme_code',
    'title',
    'stage',
    'currency',
    'amount',
    'due_date',
    'expected_days',
  ],
  expenditure_records: [
    'external_id',
    'programme_code',
    'event_type',
    'currency',
    'amount',
    'transaction_date',
    'period',
  ],
};
export const mappingSchema = z.record(z.string(), z.string().max(150));
export type RawRow = Record<string, unknown>;
export interface ReferenceData {
  facilities: Map<string, { id: string; country: string }>;
  products: Map<string, { id: string; unit: string }>;
  budgets: Map<string, { id: string; currency: string; programme_code: string }>;
}
export function validateRows(
  kind: string,
  rows: RawRow[],
  mapping: Record<string, string>,
  refs: ReferenceData,
) {
  const accepted: { row: number; data: Record<string, unknown> }[] = [],
    rejections: { row: number; field: string; reason: string; record: RawRow }[] = [],
    seen = new Set<string>();
  const required = requiredFields[kind];
  if (!required) throw new Error('Unsupported dataset kind');
  const issue = (row: number, field: string, reason: string, record: RawRow) => {
    if (!rejections.some((r) => r.row === row)) rejections.push({ row, field, reason, record });
  };
  rows.forEach((raw, index) => {
    const row = index + 2,
      r: Record<string, unknown> = {};
    for (const f of required) {
      const source = mapping[f] || f;
      r[f] = typeof raw[source] === 'string' ? (raw[source] as string).trim() : raw[source];
      if (r[f] === '' || r[f] === undefined || r[f] === null)
        issue(row, f, 'Required value is missing', raw);
    }
    if (rejections.some((x) => x.row === row)) return;
    const numberFields =
      kind === 'inventory'
        ? inventoryFields.filter(
            (f) =>
              f.includes('stock') ||
              [
                'quantity_received',
                'quantity_dispensed',
                'adjustments',
                'stockout_days',
                'delivery_lead_time_days',
              ].includes(f),
          )
        : kind === 'procurement_events'
          ? ['expected_days']
          : [];
    for (const f of numberFields) {
      if (r[f] === undefined || r[f] === '') continue;
      const n = Number(r[f]);
      if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
        issue(
          row,
          f,
          'Use a safe whole number in the declared unit; financial imports use major units without separators',
          raw,
        );
        return;
      }
      r[f] = n;
    }
    if (kind !== 'inventory') {
      if (!currency.safeParse(r.currency).success) {
        issue(row, 'currency', 'Use an explicit ISO-4217-style three-letter currency code', raw);
        return;
      }
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(r.amount)) || Number(r.amount) > 10000000000) {
        issue(
          row,
          'amount',
          'Use a non-negative amount with at most two decimal places, maximum 10 billion major units',
          raw,
        );
        return;
      }
      const [whole, fraction = ''] = String(r.amount).split('.');
      r.amount_cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (!/^\d{4}-Q[1-4]$/.test(String(r.period))) {
        issue(row, 'period', 'Reporting period must be YYYY-Q[1–4]', raw);
        return;
      }
      if (r.budget_id) {
        const b = refs.budgets.get(String(r.budget_id));
        if (!b) {
          issue(
            row,
            'budget_id',
            'No matching budget in this project; import the budget first',
            raw,
          );
          return;
        }
        if (b.currency !== r.currency) {
          issue(
            row,
            'currency',
            'Currency differs from the linked budget; no implicit conversion',
            raw,
          );
          return;
        }
        r.budget_id = b.id;
        if (r.programme_code && r.programme_code !== b.programme_code) {
          issue(
            row,
            'programme_code',
            'Programme identifier does not match the linked budget',
            raw,
          );
          return;
        }
      }
      for (const f of [
        'due_date',
        'released_date',
        'transaction_date',
        'started_date',
        'completed_date',
      ])
        if (r[f] && !date.safeParse(r[f]).success) {
          issue(row, f, 'Invalid date; use YYYY-MM-DD', raw);
          return;
        }
      if (kind === 'funding_releases' && r.status === 'Released' && !r.released_date) {
        issue(row, 'released_date', 'Released funds require an actual release date', raw);
        return;
      }
      if (
        kind === 'expenditure_records' &&
        !['Commitment', 'Payment', 'Expenditure', 'Invoice'].includes(String(r.event_type))
      ) {
        issue(row, 'event_type', 'Unsupported financial event type', raw);
        return;
      }
    } else {
      const facility = refs.facilities.get(String(r.facility_id)),
        product = refs.products.get(String(r.product_id));
      if (!facility) {
        issue(row, 'facility_id', 'Unknown facility in this project', raw);
        return;
      }
      if (!product) {
        issue(row, 'product_id', 'Unknown medicine in this project', raw);
        return;
      }
      if (product.unit !== r.unit) {
        issue(row, 'unit', `Incompatible unit. ${r.product_id} requires ${product.unit}`, raw);
        return;
      }
      for (const f of ['reporting_date', 'expiry_date'])
        if (!date.safeParse(r[f]).success) {
          issue(row, f, 'Invalid calendar date', raw);
          return;
        }
      if (String(r.expiry_date) < String(r.reporting_date)) {
        issue(
          row,
          'expiry_date',
          'Batch expired before the reporting date; resolve expired-stock quantities before import',
          raw,
        );
        return;
      }
      const nums = Object.fromEntries(
        [
          'opening_stock',
          'quantity_received',
          'quantity_dispensed',
          'adjustments',
          'closing_stock',
          'usable_stock',
          'reserved_stock',
          'expired_stock',
        ].map((f) => [f, r[f]]),
      ) as Parameters<typeof import('../shared/analytics').inventoryBalance>[0];
      const { inventoryBalance } = requireAnalytics();
      const errors = inventoryBalance(nums);
      if (errors.length) {
        issue(row, 'closing_stock', errors.join(' '), raw);
        return;
      }
      if (
        Number(r.stockout_days) > 7 ||
        Number(r.adjustments) < -100000000 ||
        Number(r.minimum_stock) > Number(r.maximum_stock)
      ) {
        issue(
          row,
          'stockout_days',
          'Weekly stockout days must be 0–7 and minimum stock cannot exceed maximum',
          raw,
        );
        return;
      }
      r.facility_uuid = facility.id;
      r.product_uuid = product.id;
    }
    const key =
      kind === 'inventory'
        ? `${r.facility_id}|${r.product_id}|${r.reporting_date}|${r.batch_identifier || ''}`
        : String(r.external_id);
    if (seen.has(key)) {
      issue(
        row,
        kind === 'inventory' ? 'reporting_date' : 'external_id',
        'Duplicate business key within this import; original retained for review, duplicate rejected',
        raw,
      );
      return;
    }
    seen.add(key);
    accepted.push({ row, data: r });
  });
  return { accepted, rejections };
}
import * as analytics from '../shared/analytics';
function requireAnalytics() {
  return analytics;
}
export function qualityReport(
  kind: string,
  rows: RawRow[],
  accepted: number,
  rejections: { row: number; field: string; reason: string }[],
  asOf: string,
) {
  const fields = requiredFields[kind] || [];
  const issues: Record<
    string,
    {
      type: string;
      field: string;
      count: number;
      severity: string;
      examples: number[];
      remediation: string;
      status: string;
    }
  > = {};
  for (const r of rejections) {
    const key = r.field + r.reason;
    if (!issues[key])
      issues[key] = {
        type: r.reason.includes('Duplicate')
          ? 'Uniqueness'
          : r.reason.includes('Unknown') || r.reason.includes('matching')
            ? 'Referential integrity'
            : 'Validity / consistency',
        field: r.field,
        count: 0,
        severity: 'High',
        examples: [],
        remediation: r.reason,
        status: 'Rejected — not imported',
      };
    issues[key].count++;
    if (issues[key].examples.length < 5) issues[key].examples.push(r.row);
  }
  const completeness = rows.length
    ? Object.fromEntries(
        fields.map((f) => [
          f,
          Math.round(
            (rows.filter((r) => r[f] !== '' && r[f] !== null && r[f] !== undefined).length /
              rows.length) *
              1000,
          ) / 10,
        ]),
      )
    : {};
  const dates = rows
    .map((r) => String(r.reporting_date || r.transaction_date || ''))
    .filter(Boolean)
    .sort();
  const latest = dates.at(-1) || null;
  return {
    metrics: {
      records: rows.length,
      accepted,
      rejected: rejections.length,
      completeness,
      validity_percent: rows.length ? Math.round((accepted / rows.length) * 1000) / 10 : null,
      schema_conformity: rejections.length ? 'Issues found' : 'Conforms to import rules',
      timeliness: { latest_record: latest, reference_date: asOf },
      accuracy: 'Not verifiable without a trusted external operational reference',
    },
    issues: Object.values(issues),
    limitations: [
      'Structural checks do not verify real-world accuracy.',
      'Only rejected rows are excluded; every rejection is retained in the import job.',
      'Clean demonstration results exclude the separate defect fixture.',
      'No exchange-rate conversion is performed.',
    ],
  };
}
