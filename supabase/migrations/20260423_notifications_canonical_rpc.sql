begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

create index if not exists notifications_user_id_read_idx
  on public.notifications (user_id, read);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_owner on public.notifications;
create policy notifications_select_owner
on public.notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = notifications.user_id
      and profiles.owner_uid = auth.uid()
  )
);

drop policy if exists notifications_update_owner on public.notifications;
create policy notifications_update_owner
on public.notifications
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = notifications.user_id
      and profiles.owner_uid = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = notifications.user_id
      and profiles.owner_uid = auth.uid()
  )
);

create or replace function public.create_session_joined_notification(
  recipient_profile_id uuid,
  actor_profile_id uuid,
  session_id uuid,
  spot_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = actor_profile_id
      and profiles.owner_uid = auth.uid()
  ) then
    raise exception 'ACTOR_PROFILE_NOT_OWNED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = recipient_profile_id
  ) then
    raise exception 'RECIPIENT_PROFILE_NOT_FOUND';
  end if;

  if recipient_profile_id = actor_profile_id then
    raise exception 'RECIPIENT_CANNOT_EQUAL_ACTOR';
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    data
  ) values (
    recipient_profile_id,
    actor_profile_id,
    'session_joined',
    jsonb_build_object(
      'sessionId', session_id,
      'spotName', spot_name
    )
  );
end;
$$;

revoke all on function public.create_session_joined_notification(uuid, uuid, uuid, text) from public;
grant execute on function public.create_session_joined_notification(uuid, uuid, uuid, text) to authenticated;

commit;
