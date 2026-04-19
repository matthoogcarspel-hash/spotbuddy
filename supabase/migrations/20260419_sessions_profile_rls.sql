alter table public.sessions enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sessions'
      and cmd in ('INSERT', 'UPDATE')
  loop
    execute format('drop policy if exists %I on public.sessions', policy_record.policyname);
  end loop;
end
$$;

create policy sessions_insert_owned_profile
on public.sessions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = sessions.user_id
      and profiles.owner_uid = auth.uid()
  )
);

create policy sessions_update_owned_profile
on public.sessions
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = sessions.user_id
      and profiles.owner_uid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = sessions.user_id
      and profiles.owner_uid = auth.uid()
  )
);
