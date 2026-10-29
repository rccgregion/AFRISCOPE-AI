import { tables } from '../server/schema.mjs';
import { writeFileSync } from 'node:fs';
let sql = `-- AfriScope 001: relational core and database-enforced tenant isolation.
-- gen_random_uuid() is built in on PostgreSQL 13+ and PGlite.
do $$ begin if not exists (select from pg_roles where rolname='afri_app') then create role afri_app nologin; end if; end $$;
create table organisations (id uuid primary key default gen_random_uuid(), name text not null, is_demo boolean not null default false, settings jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table user_profiles (id uuid primary key default gen_random_uuid(), email text not null unique, full_name text not null, password_hash text, is_platform_admin boolean not null default false, preferences jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table organisation_memberships (id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade, user_id uuid not null references user_profiles(id) on delete cascade, role text not null check(role in ('platform_admin','organisation_admin','programme_manager','data_analyst','operator','reviewer','executive')), created_at timestamptz not null default now(), unique(organisation_id,user_id));
create table projects (id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete restrict, title text not null, sector text not null, countries text not null, description text not null default '', status text not null default 'Active', settings jsonb not null default '{}', created_by uuid references user_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table project_memberships (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade, user_id uuid not null references user_profiles(id) on delete cascade, role text not null check(role in ('platform_admin','organisation_admin','programme_manager','data_analyst','operator','reviewer','executive')), created_at timestamptz not null default now(), unique(project_id,user_id));
create table auth_sessions (token_hash text primary key, user_id uuid not null references user_profiles(id) on delete cascade, expires_at timestamptz not null, created_at timestamptz not null default now());
create table auth_throttle (key text primary key, attempts integer not null, reset_at timestamptz not null);
create table invitations (id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete cascade, email text not null, role text not null, token_hash text not null unique, expires_at timestamptz not null, accepted_at timestamptz);
create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now());
create function app_uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
create function is_org_member(org uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from organisation_memberships where organisation_id=org and user_id=app_uid()) or exists(select 1 from user_profiles where id=app_uid() and is_platform_admin) $$;
create function is_org_admin(org uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from organisation_memberships where organisation_id=org and user_id=app_uid() and role in ('organisation_admin','platform_admin')) or exists(select 1 from user_profiles where id=app_uid() and is_platform_admin) $$;
create function project_role(p uuid) returns text language sql stable security definer set search_path=public as $$ select coalesce((select pm.role from project_memberships pm where pm.project_id=p and pm.user_id=app_uid()),(select om.role from projects pr join organisation_memberships om on om.organisation_id=pr.organisation_id where pr.id=p and om.user_id=app_uid() and om.role in ('organisation_admin','platform_admin')),(select 'platform_admin' from user_profiles where id=app_uid() and is_platform_admin)) limit 1 $$;
create function project_org(p uuid) returns uuid language sql stable security definer set search_path=public as $$ select organisation_id from projects where id=p $$;
create function project_permission(p uuid, permission text) returns boolean language sql stable security definer set search_path=public as $$ select case project_role(p) when 'platform_admin' then true when 'organisation_admin' then true when 'programme_manager' then permission in ('read','data','manage','operate') when 'data_analyst' then permission in ('read','data') when 'operator' then permission in ('read','operate') when 'reviewer' then permission in ('read','approve') when 'executive' then permission='read' else false end $$;
create function touch_updated() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
grant usage on schema public to afri_app;
grant select,insert,update,delete on all tables in schema public to afri_app;
revoke all on auth_sessions,auth_throttle,invitations from afri_app;
revoke update(password_hash,is_platform_admin) on user_profiles from afri_app;
alter table user_profiles enable row level security;
create policy profile_read on user_profiles for select using (id=app_uid() or exists(select 1 from organisation_memberships mine join organisation_memberships theirs on mine.organisation_id=theirs.organisation_id where mine.user_id=app_uid() and theirs.user_id=user_profiles.id) or is_platform_admin);
create policy profile_update on user_profiles for update using (id=app_uid()) with check(id=app_uid());
alter table organisations enable row level security;
create policy org_read on organisations for select using(is_org_member(id));
create policy org_update on organisations for update using(is_org_admin(id)) with check(is_org_admin(id));
alter table organisation_memberships enable row level security;
create policy om_read on organisation_memberships for select using(is_org_member(organisation_id));
create policy om_write on organisation_memberships for all using(is_org_admin(organisation_id)) with check(is_org_admin(organisation_id));
alter table projects enable row level security;
create policy project_read on projects for select using(project_role(id) is not null);
create policy project_insert on projects for insert with check(is_org_member(organisation_id) and project_role(id) is null);
`;
// Project creation is a privileged, validated API transaction; no arbitrary tenant inserts.
sql = sql.replace(
  'create policy project_insert on projects for insert with check(is_org_member(organisation_id) and project_role(id) is null);',
  "create policy project_insert on projects for insert with check(project_permission(id,'manage'));",
);
sql += `create policy project_update on projects for update using(project_permission(id,'manage')) with check(project_permission(id,'manage'));
alter table project_memberships enable row level security;
create policy pm_read on project_memberships for select using(project_role(project_id) is not null);
create policy pm_write on project_memberships for all using(is_org_admin(project_org(project_id))) with check(is_org_admin(project_org(project_id)));
`;
for (const [name, t] of Object.entries(tables)) {
  const fields = Object.entries(t.fields)
    .filter(([n]) => !['unique', 'check'].includes(n))
    .map(([n, d]) => `${n} ${d}`);
  const extras = Object.entries(t.fields)
    .filter(([n]) => ['unique', 'check'].includes(n))
    .map(([n, d]) => `${n === 'unique' ? 'unique' : 'check'} ${d}`);
  sql += `create table ${name} (id uuid primary key default gen_random_uuid(), organisation_id uuid not null references organisations(id) on delete restrict, project_id uuid not null references projects(id) on delete restrict, created_by uuid references user_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), ${fields.join(', ')}${extras.length ? ', ' + extras.join(', ') : ''});\n`;
  sql += `create index ${name}_project_idx on ${name}(project_id,created_at);\nalter table ${name} enable row level security;\n`;
  sql += `create policy ${name}_read on ${name} for select using(project_permission(project_id,'read'));\n`;
  const permission = t.self ? 'read' : t.group;
  sql += `create policy ${name}_insert on ${name} for insert with check(project_permission(project_id,'${permission}') ${t.self ? `and user_id=app_uid()` : ''});\n`;
  if (!t.immutable) {
    sql += `create policy ${name}_update on ${name} for update using(project_permission(project_id,'${permission}') ${t.self ? `and user_id=app_uid()` : ''}) with check(project_permission(project_id,'${permission}') ${t.self ? `and user_id=app_uid()` : ''});\n`;
    if (!['audit_logs', 'approvals', 'recommendation_evidence'].includes(name))
      sql += `create policy ${name}_delete on ${name} for delete using(project_permission(project_id,'admin'));\n`;
    sql += `create trigger ${name}_updated before update on ${name} for each row execute function touch_updated();\n`;
  }
}
sql += `create index inventory_series_idx on inventory_records(project_id,facility_id,product_id,reporting_date);
create index evidence_project_idx on evidence_records using gin(source_versions);
create index session_expiry_idx on auth_sessions(expires_at);
insert into schema_migrations(version) values ('001_core.sql') on conflict do nothing;\n`;
sql += `grant select,insert,update,delete on all tables in schema public to afri_app;
revoke all on auth_sessions,auth_throttle,invitations from afri_app;
revoke update on user_profiles from afri_app;
grant update(full_name,preferences,updated_at) on user_profiles to afri_app;
grant execute on all functions in schema public to afri_app;`;
writeFileSync(new URL('../supabase/migrations/001_core.sql', import.meta.url), sql);
