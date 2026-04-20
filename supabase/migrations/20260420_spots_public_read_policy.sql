alter table public.spots enable row level security;

drop policy if exists "public read spots" on public.spots;

create policy "public read spots"
on public.spots
for select
using (true);
