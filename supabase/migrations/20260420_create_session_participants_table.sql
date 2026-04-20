create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (session_id, user_id)
);

alter table public.session_participants enable row level security;

create policy "session_participants_select"
on public.session_participants
for select
using (true);

create policy "session_participants_insert"
on public.session_participants
for insert
with check (true);

create policy "session_participants_delete"
on public.session_participants
for delete
using (true);
