-- Atomic self-service project creation cannot satisfy a membership-based INSERT policy
-- before its first membership exists. This narrow definer validates the caller first.
create function create_project_for_member(p_organisation_id uuid,p_title text,p_sector text,p_countries text,p_description text) returns uuid language plpgsql security definer set search_path=public as $$
declare p_id uuid; allowed boolean;
begin
 select exists(select 1 from organisation_memberships where organisation_id=p_organisation_id and user_id=app_uid() and role in ('organisation_admin','platform_admin','programme_manager')) or exists(select 1 from user_profiles where id=app_uid() and is_platform_admin) into allowed;
 if not allowed then raise exception 'Project creation requires organisation management permission'; end if;
 insert into projects(organisation_id,title,sector,countries,description,created_by,settings) values(p_organisation_id,p_title,p_sector,p_countries,p_description,app_uid(),'{"stock_threshold_days":21}') returning id into p_id;
 insert into project_memberships(project_id,user_id,role) select p_id,app_uid(),role from organisation_memberships where organisation_id=p_organisation_id and user_id=app_uid();
 return p_id;
end $$;
revoke execute on function create_project_for_member(uuid,text,text,text,text) from public;
grant execute on function create_project_for_member(uuid,text,text,text,text) to afri_app;
