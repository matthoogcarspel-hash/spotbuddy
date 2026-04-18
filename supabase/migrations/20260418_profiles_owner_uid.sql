alter table if exists public.profiles
  add column if not exists owner_uid uuid;

update public.profiles
set owner_uid = id
where owner_uid is null
  and id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

create index if not exists profiles_owner_uid_idx on public.profiles(owner_uid);
