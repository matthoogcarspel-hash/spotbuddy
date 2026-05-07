alter table public.sessions
add column if not exists source_session_id uuid references public.sessions(id) on delete cascade;

create index if not exists sessions_source_session_id_idx
on public.sessions(source_session_id);
