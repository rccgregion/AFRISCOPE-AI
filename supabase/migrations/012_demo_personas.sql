-- 012_demo_personas.sql
-- Part 3.1: the seeded demonstration personas had two people called "Amina" and a
-- platform administrator labelled "reviewer". Rename the demo profiles so each
-- persona has one name and one role.
--
-- Additive & idempotent: only UPDATEs the two seeded demo user_profiles rows.
-- No columns, grants or policies are touched; no row is deleted.
--
-- ROLLBACK:
--   update user_profiles set full_name='Alex · Platform reviewer'
--     where id='20000000-0000-4000-8000-000000000001'
--       and full_name='Alex · Platform administrator';
--   update user_profiles set full_name='Amina · Organisation admin'
--     where id='20000000-0000-4000-8000-000000000002'
--       and full_name='Amara · Organisation admin';

update user_profiles
set full_name = 'Alex · Platform administrator'
where id = '20000000-0000-4000-8000-000000000001'
  and full_name = 'Alex · Platform reviewer';

update user_profiles
set full_name = 'Amara · Organisation admin'
where id = '20000000-0000-4000-8000-000000000002'
  and full_name = 'Amina · Organisation admin';
