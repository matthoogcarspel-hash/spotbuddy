begin;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, expo_push_token)
);

create index if not exists push_tokens_profile_id_idx
  on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select_owner on public.push_tokens;
create policy push_tokens_select_owner
on public.push_tokens
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = push_tokens.profile_id
      and profiles.owner_uid = auth.uid()
  )
);

drop policy if exists push_tokens_insert_owner on public.push_tokens;
create policy push_tokens_insert_owner
on public.push_tokens
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = push_tokens.profile_id
      and profiles.owner_uid = auth.uid()
  )
);

drop policy if exists push_tokens_update_owner on public.push_tokens;
create policy push_tokens_update_owner
on public.push_tokens
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = push_tokens.profile_id
      and profiles.owner_uid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = push_tokens.profile_id
      and profiles.owner_uid = auth.uid()
  )
);

commit;
