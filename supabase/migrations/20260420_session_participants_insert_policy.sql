create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique (session_id, user_id)
);

alter table public.session_participants enable row level security;

create policy "Allow insert participants"
on public.session_participants
for insert
with check (true);
