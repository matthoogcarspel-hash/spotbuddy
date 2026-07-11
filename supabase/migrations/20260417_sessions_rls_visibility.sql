alter table public.sessions enable row level security;

-- Allow signed-in users to read all sessions.
drop policy if exists "Users can view their own sessions" on public.sessions;
drop policy if exists "Authenticated users can read sessions" on public.sessions;
create policy "Authenticated users can read sessions"
  on public.sessions
  for select
  to authenticated
  using (true);

-- Restrict inserts to the session owner.
drop policy if exists "Users can insert their own sessions" on public.sessions;
create policy "Users can insert their own sessions"
  on public.sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Restrict updates to the session owner.
drop policy if exists "Users can update their own sessions" on public.sessions;
create policy "Users can update their own sessions"
  on public.sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Restrict deletes to the session owner.
drop policy if exists "Users can delete their own sessions" on public.sessions;
create policy "Users can delete their own sessions"
  on public.sessions
  for delete
  to authenticated
  using (user_id = auth.uid());
