alter table public.sessions
  add column if not exists participants jsonb;

update public.sessions
set participants = case
  when jsonb_typeof(participants) = 'array' then participants
  else '[]'::jsonb
end;

update public.sessions
set participants = participants || jsonb_build_array(user_id)
where user_id is not null
  and jsonb_typeof(participants) = 'array'
  and not (participants @> jsonb_build_array(user_id));

alter table public.sessions
  alter column participants set default '[]'::jsonb;

alter table public.sessions
  alter column participants set not null;

drop policy if exists sessions_update_owned_profile on public.sessions;

create policy sessions_update_join_or_owner_profile
on public.sessions
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.owner_uid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.owner_uid = auth.uid()
      and (
        profiles.id = sessions.user_id
        or (
          jsonb_typeof(sessions.participants) = 'array'
          and sessions.participants @> jsonb_build_array(profiles.id)
        )
      )
  )
);
