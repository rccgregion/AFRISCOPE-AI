-- 010_data_origin.sql
--
-- Marks where every row came from: 'sample' (synthetic demonstration data) or
-- 'real' (entered or imported from a named source by a named user).
--
-- ADDITIVE ONLY: new columns are nullable or defaulted, nothing is dropped or
-- renamed, and no existing row is deleted. Re-running this file is a no-op.
--
-- Default is 'real' so that any row written by code that predates this
-- migration keeps its current (implicit) meaning of "user/tenant data". Rows
-- produced by the demo seeder and by the sample pack are explicitly relabelled
-- 'sample' below.

-- 1. data_origin on every table that stores sample-derived content.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects',
    'datasets',
    'dataset_versions',
    'data_quality_results',
    'facilities',
    'medicine_products',
    'inventory_records',
    'consumption_records',
    'funding_releases',
    'expenditure_records',
    'budgets',
    'procurement_events',
    'deliveries',
    'operational_alerts',
    'recommendations',
    'recommendation_evidence',
    'evidence_records',
    'optimisation_scenarios',
    'intervention_options',
    'analytical_runs',
    'experiments',
    'experiment_runs',
    'experiment_results',
    'problem_briefs',
    'stakeholders',
    'risk_assessments',
    'milestones',
    'action_items'
  ]
  loop
    execute format(
      'alter table %I add column if not exists data_origin text not null default ''real''',
      t
    );
    execute format(
      'alter table %I drop constraint if exists %I',
      t, t || '_data_origin_check'
    );
    execute format(
      'alter table %I add constraint %I check (data_origin in (''sample'',''real''))',
      t, t || '_data_origin_check'
    );
    execute format('create index if not exists %I on %I (data_origin)', t || '_origin_idx', t);
  end loop;
end $$;

-- 2. Provenance columns for stock/signal rows imported into a project.
--    coverage_days is ALWAYS derived (usable_stock / avg_daily_consumption);
--    supplied_coverage_days preserves whatever the file claimed so a mismatch
--    can be reported instead of silently trusted.
alter table inventory_records add column if not exists avg_daily_consumption numeric(12,2);
alter table inventory_records add column if not exists coverage_days numeric(12,2);
alter table inventory_records add column if not exists supplied_coverage_days numeric(12,2);
alter table inventory_records add column if not exists coverage_mismatch boolean not null default false;
alter table inventory_records add column if not exists risk_level text;
alter table inventory_records add column if not exists financing_signal text;
alter table inventory_records add column if not exists last_signal_date date;
alter table inventory_records add column if not exists source text;
alter table inventory_records add column if not exists import_batch_id uuid;

alter table facilities add column if not exists source text;
alter table facilities add column if not exists import_batch_id uuid;
alter table facilities add column if not exists notes text;

-- 3. Import batches: lineage plus per-batch undo. Additive new table.
create table if not exists data_import_batches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete restrict,
  project_id uuid not null references projects(id) on delete restrict,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  batch_kind text not null check (batch_kind in ('sample_pack','real_import','manual_entry')),
  data_origin text not null default 'real' check (data_origin in ('sample','real')),
  file_name text,
  source text,
  row_counts jsonb not null default '{}',
  rejection_count integer not null default 0,
  notes text
);
create index if not exists data_import_batches_project_idx
  on data_import_batches (project_id, created_at desc);

alter table data_import_batches enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'data_import_batches' and policyname = 'import_batch_read'
  ) then
    create policy import_batch_read on data_import_batches
      for select using (project_permission(project_id, 'read'));
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'data_import_batches' and policyname = 'import_batch_write'
  ) then
    -- 'data' (not 'manage') because data analysts are the people who upload,
    -- and the application still enforces the import permission on the route.
    create policy import_batch_write on data_import_batches
      for all using (project_permission(project_id, 'data'))
      with check (project_permission(project_id, 'data'));
  end if;
end $$;

grant select, insert, update, delete on data_import_batches to afri_app;

-- 4. Relabel existing demonstration rows as sample. Scoped to the demo
--    organisation so private/tenant data is never touched. Idempotent.
update projects set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update datasets set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update dataset_versions set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update data_quality_results set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update facilities set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update medicine_products set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update inventory_records set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update consumption_records set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update funding_releases set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update expenditure_records set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update budgets set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update procurement_events set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update deliveries set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update operational_alerts set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update recommendations set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update evidence_records set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update recommendation_evidence set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update optimisation_scenarios set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update intervention_options set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update experiments set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update problem_briefs set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update stakeholders set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update risk_assessments set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update milestones set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';
update action_items set data_origin = 'sample'
  where organisation_id = '00000000-0000-4000-8000-000000000001';

-- 5. Backfill coverage_days for existing inventory rows where it is derivable.
--    Rule is the same one the importer enforces: coverage_days =
--    usable_stock / average daily consumption. Average daily consumption comes
--    from consumption_records (total quantity / total days covered). Rows with
--    no consumption history keep NULL rather than a guess — an absent
--    denominator must never become a fabricated days-of-stock figure.
with usage as (
  select facility_id,
         product_id,
         sum(quantity)::numeric
           / greatest(sum((period_end - period_start) + 1), 1) as per_day
  from consumption_records
  group by facility_id, product_id
)
update inventory_records i
set avg_daily_consumption = round(u.per_day, 2),
    coverage_days = case
      when u.per_day > 0 then round(i.usable_stock::numeric / u.per_day, 2)
      else null
    end
from usage u
where i.facility_id = u.facility_id
  and i.product_id = u.product_id
  and i.coverage_days is null
  and i.usable_stock >= 0;

-- 6. Make the sample label visible on rows that already exist. Additive,
--    idempotent, and restricted to rows already marked data_origin='sample' —
--    real rows are never rewritten. Rollback (documented in the PR):
--      update facilities set name = replace(name, '[Sample] ', '')
--        where data_origin='sample' and name like '[Sample] %';
--      update operational_alerts set title = replace(title, 'Simulated: ', '')
--        where data_origin='sample' and title like 'Simulated: %';
update facilities
   set name = '[Sample] ' || name
 where data_origin = 'sample'
   and name not like '[Sample] %';

update operational_alerts
   set title = 'Simulated: ' || title
 where data_origin = 'sample'
   and title not like 'Simulated:%';
