-- 011: connector truthfulness, backup status, and durable backup payloads.
--
-- Additive and idempotent. Two kinds of change:
--   1. New nullable/defaulted columns. Nothing is dropped or renamed, so old
--      code and old sessions keep working.
--   2. A corrective data update that removes values the application invented:
--      the seeded connectors claimed 124 / 86 / 52 "synced rows", a last-sync
--      timestamp and an Active/Idle status while no request had ever been made.
--      These were never real results, so they are cleared rather than migrated.
--
-- Rollback (also in the PR description): the columns are optional for the
-- previous code path, so `git revert` of the application commit restores the old
-- behaviour. To also drop the columns:
--   alter table live_data_connectors
--     drop column if exists connection_mode, drop column if exists last_run_at,
--     drop column if exists last_run_rows, drop column if exists last_run_ok,
--     drop column if exists last_error, drop column if exists http_status,
--     drop column if exists run_count;
--   alter table backups drop column if exists payload;

alter table live_data_connectors
  add column if not exists connection_mode text not null default 'not_configured',
  add column if not exists last_run_at timestamptz,
  add column if not exists last_run_rows integer,
  add column if not exists last_run_ok boolean,
  add column if not exists last_error text,
  add column if not exists http_status integer,
  add column if not exists run_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'live_data_connectors_connection_mode_check'
  ) then
    alter table live_data_connectors
      add constraint live_data_connectors_connection_mode_check
      check (connection_mode in ('not_configured', 'configured'));
  end if;
end $$;

-- Remove invented results. A connector is only "configured" once an HTTPS
-- endpoint has been supplied by a user; until then it has never run.
update live_data_connectors
   set connection_mode = 'not_configured',
       sync_status = 'Not configured',
       rows_synced = 0,
       run_count = 0,
       last_sync_at = null,
       last_run_at = null,
       last_run_rows = null,
       last_run_ok = null,
       http_status = null,
       last_error = null,
       config = config - 'endpoint_url'
 where coalesce(config->>'endpoint_url', '') = ''
    or (config->>'endpoint_url') like '%synthetic%';

-- Snapshots are stored in the database as well as on disk: serverless
-- deployments have a read-only filesystem, so a disk-only snapshot could be
-- recorded as completed while being unrecoverable.
alter table backups add column if not exists payload jsonb;
