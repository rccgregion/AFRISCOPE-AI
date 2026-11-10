-- 008: Automated recurring backups, webhooks, and live data connectors
create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id) on delete cascade,
  status text not null default 'Completed',
  backup_type text not null default 'manual',
  filename text not null,
  size_bytes bigint not null default 0,
  record_count integer not null default 0,
  checksum text not null,
  metadata jsonb not null default '{}',
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create table if not exists webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references organisations(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  secret text not null default '',
  events jsonb not null default '["alerts","stock","approvals"]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_triggered_at timestamptz,
  last_status text default 'Healthy'
);

create table if not exists live_data_connectors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  source_type text not null default 'supabase_direct',
  config jsonb not null default '{}',
  last_sync_at timestamptz,
  sync_status text not null default 'Active',
  rows_synced integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on backups to afri_app;
grant select, insert, update, delete on webhook_subscriptions to afri_app;
grant select, insert, update, delete on live_data_connectors to afri_app;

alter table backups enable row level security;
create policy backups_read on backups for select using (is_org_member(organisation_id));
create policy backups_write on backups for all using (is_org_admin(organisation_id)) with check (is_org_admin(organisation_id));

alter table webhook_subscriptions enable row level security;
create policy webhooks_read on webhook_subscriptions for select using (is_org_member(organisation_id));
create policy webhooks_write on webhook_subscriptions for all using (is_org_admin(organisation_id)) with check (is_org_admin(organisation_id));

alter table live_data_connectors enable row level security;
create policy connectors_read on live_data_connectors for select using (project_role(project_id) is not null);
create policy connectors_write on live_data_connectors for all using (project_permission(project_id, 'manage')) with check (project_permission(project_id, 'manage'));
