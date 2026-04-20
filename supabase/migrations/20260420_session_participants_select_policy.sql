alter table public.session_participants enable row level security;

create policy if not exists "Allow select participants"
on public.session_participants
for select
to authenticated
using (true);
