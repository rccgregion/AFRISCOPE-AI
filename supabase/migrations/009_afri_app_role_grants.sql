-- 009_afri_app_role_grants.sql
--
-- WHY THIS EXISTS
-- server/db.ts `scoped()` enforces tenant isolation by switching the session to
-- the unprivileged `afri_app` role inside a transaction:
--
--     select set_config('app.user_id', $1, true);
--     set local role afri_app;      -- <-- RLS policies then apply
--
-- The connecting user (e.g. Supabase `postgres.<project-ref>` through the
-- Supavisor pooler) is a table owner/superuser and therefore BYPASSES row-level
-- security. Switching to `afri_app` is what makes the RLS policies in
-- 001_core.sql actually apply, so tenant isolation depends on this switch.
--
-- Migration 001 creates `afri_app` and grants it table privileges, but nothing
-- ever granted the *connecting user membership of* `afri_app`. Without that
-- membership PostgreSQL raises:
--
--     ERROR 42501: permission denied to set role "afri_app"
--
-- which surfaced as a 500 on every `db.scoped()` route (e.g. GET /api/workspace)
-- while `db.admin()` routes such as /api/health kept working — the exact
-- split-role failure this migration fixes.
--
-- This migration is idempotent and safe to re-run. It preserves the existing
-- least-privilege revokes from 001/002/003/004 at the end.

-- 1. Create the role if it does not exist (no login: it is only ever reached
--    through SET ROLE from an authenticated connection).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'afri_app') then
    create role afri_app nologin;
  end if;
end $$;

-- 2. Allow the connecting user to assume the role. `WITH SET TRUE` (PostgreSQL
--    14+) permits SET ROLE without granting ADMIN OPTION. The fallback covers
--    older servers where the WITH clause is not accepted.
do $$
begin
  begin
    execute format('grant afri_app to %I with set true', current_user);
  exception
    when syntax_error then
      execute format('grant afri_app to %I', current_user);
    when duplicate_object then
      null; -- membership already present
  end;
end $$;

-- 3. Schema usage plus current table/sequence/function privileges.
grant usage on schema public to afri_app;
grant select, insert, update, delete on all tables in schema public to afri_app;
grant usage, select on all sequences in schema public to afri_app;
grant execute on all functions in schema public to afri_app;

-- 4. Cover objects created in future migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to afri_app;
alter default privileges in schema public
  grant usage, select on sequences to afri_app;
alter default privileges in schema public
  grant execute on functions to afri_app;

-- 5. Preserve least privilege: re-apply the revokes from earlier migrations so
--    the broad grant in step 3 cannot widen access to session/credential tables.
revoke all on auth_sessions, auth_throttle, invitations from afri_app;
revoke insert on projects from afri_app;
revoke update on user_profiles from afri_app;
grant update (full_name, preferences, updated_at) on user_profiles to afri_app;
revoke execute on function check_tenant() from afri_app;
revoke execute on function check_references() from afri_app;
