import { tables } from '../server/schema.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const lines = [
  '# Data dictionary',
  '',
  'Generated from `server/schema.mjs` plus core migration and import definitions. Regenerate with `node scripts/generate_dictionary.mjs`. All demonstration values are synthetic.',
  '',
  '## Conventions',
  '',
  'UUID primary keys; `organisation_id` and `project_id` enforce tenant scope; `created_by` references the actor; timestamps are PostgreSQL `timestamptz`. JSONB documents are schema-validated at API boundaries where writable. Financial facts use integer cents and explicit currency; inventory quantities use the medicine master unit. Immutable tables have no application-role UPDATE policy.',
  '',
  '## Core identity and access tables',
  '',
  '| Table | Purpose | Key fields |',
  '|---|---|---|',
  '| organisations | Tenant boundary and demo marker | id, name, is_demo, settings |',
  '| user_profiles | Account identity; password hash never exposed to app role | id, email, full_name, password_hash, is_platform_admin, preferences |',
  '| organisation_memberships | Organisation role | organisation_id, user_id, role; unique membership |',
  '| projects | Decision workspace | organisation_id, title, sector, countries, settings, created_by |',
  '| project_memberships | Project role override | project_id, user_id, role; unique membership |',
  '| auth_sessions | Hashed opaque sessions | token_hash, user_id, expires_at |',
  '| auth_throttle | Login attempt window | key, attempts, reset_at |',
  '| invitations | Single-use email-bound invitation | organisation_id, email, role, token_hash, expires_at, accepted_at |',
  '| schema_migrations | Applied forward migrations | version, applied_at |',
  '',
  '## Domain tables',
  '',
];
for (const [name, t] of Object.entries(tables)) {
  lines.push(
    `### ${name}`,
    `Permission group: \`${t.group}\`${t.immutable ? ' · immutable' : ''}${t.self ? ' · owner-private' : ''}.`,
    '',
    '| Field | PostgreSQL definition |',
    '|---|---|',
  );
  for (const [f, d] of Object.entries(t.fields))
    lines.push(`| ${f} | \`${d.replaceAll('|', '\\|')}\` |`);
  lines.push('');
}
lines.push(
  '## Import CSV/XLSX schemas',
  '',
  'Required fields are enforced by `server/validation.ts`; optional fields are retained where supported. Source row numbers are retained in rejection reports.',
  '',
  '| Schema | Required fields |',
  '|---|---|',
  '| inventory | facility_id, product_id, unit, reporting_date, opening_stock, quantity_received, quantity_dispensed, adjustments, closing_stock, usable_stock, reserved_stock, expired_stock, stockout_days, expiry_date, minimum_stock, maximum_stock |',
  '| budgets | external_id, programme_code, programme_name, currency, period, amount |',
  '| funding_releases | external_id, budget_id, currency, amount, due_date, status, period |',
  '| procurement_events | external_id, programme_code, title, stage, currency, amount, due_date, expected_days |',
  '| expenditure_records | external_id, programme_code, event_type, currency, amount, transaction_date, period |',
  '',
  'Inventory additional fields: country, region, district, facility_type, medicine_name, supplier, expected_delivery_date, delivery_lead_time_days, batch_identifier, data_source, data_quality_status. Finance amounts are major units with ≤2 decimals; periods are YYYY-Q[1–4]. No implicit FX conversion.',
  '',
  '## Synthetic files',
  '',
  '| File | Rows | Meaning |',
  '|---|---:|---|',
);
const manifest = JSON.parse(readFileSync('public/demo/manifest.json', 'utf8'));
for (const [f, n] of Object.entries(manifest.counts))
  lines.push(
    `| ${f} | ${n} | ${f.includes('defect') ? 'Intentionally rejected quality fixture' : 'Synthetic demonstration fixture'} |`,
  );
lines.push(
  '',
  'See DATA_QUALITY.md for validation semantics and MODEL_EVALUATION.md for analytical limitations.',
  '',
);
writeFileSync('docs/DATA_DICTIONARY.md', lines.join('\n'));
