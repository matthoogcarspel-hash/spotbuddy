alter table public.sessions
  add column if not exists intent text;

update public.sessions
set intent = 'likely'
where intent is null;

alter table public.sessions
  alter column intent set default 'likely';

alter table public.sessions
  alter column intent set not null;

alter table public.sessions
  drop constraint if exists sessions_intent_check;

alter table public.sessions
  add constraint sessions_intent_check
    check (intent in ('maybe', 'likely', 'definitely'));
