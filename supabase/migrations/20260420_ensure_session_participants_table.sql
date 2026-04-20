create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (session_id, user_id)
);

alter table if exists public.session_participants enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'session_participants'
      and policyname = 'session_participants_select'
  ) then
    create policy "session_participants_select"
      on public.session_participants
      for select
      using (auth.uid() is not null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'session_participants'
      and policyname = 'session_participants_insert'
  ) then
    create policy "session_participants_insert"
      on public.session_participants
      for insert
      with check (auth.uid() is not null and auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'session_participants'
      and policyname = 'session_participants_delete'
  ) then
    create policy "session_participants_delete"
      on public.session_participants
      for delete
      using (auth.uid() is not null and auth.uid() = user_id);
  end if;
end
$$;
