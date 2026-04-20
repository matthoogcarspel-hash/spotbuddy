create policy "Allow read participants"
on public.session_participants
for select
using (true);
