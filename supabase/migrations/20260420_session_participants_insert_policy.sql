alter table if exists public.session_participants enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'session_participants'
      and c.relkind = 'r'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'session_participants'
      and policyname = 'Allow insert participants'
  ) then
    create policy "Allow insert participants"
      on public.session_participants
      for insert
      with check (true);
  end if;
end
$$;
