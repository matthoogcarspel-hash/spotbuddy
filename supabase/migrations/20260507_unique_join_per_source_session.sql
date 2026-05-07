create unique index if not exists sessions_unique_join_per_source_session_idx
on public.sessions(user_id, source_session_id)
where source_session_id is not null;
