-- Username-based sign-in alongside existing email sign-in.
alter table user_profiles add column if not exists username text;
alter table user_profiles alter column email drop not null;
alter table user_profiles drop constraint if exists user_profiles_email_key;
create unique index if not exists user_profiles_email_unique on user_profiles(lower(email)) where email is not null;
create unique index if not exists user_profiles_username_unique on user_profiles(lower(username)) where username is not null;
alter table user_profiles drop constraint if exists user_profiles_identity_present;
alter table user_profiles add constraint user_profiles_identity_present check(email is not null or username is not null);
alter table user_profiles drop constraint if exists user_profiles_username_format;
alter table user_profiles add constraint user_profiles_username_format check(username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
