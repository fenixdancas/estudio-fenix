begin;
alter table public.aulas_experimentais
 add column if not exists dados_fenix jsonb not null default '{}'::jsonb;
alter table public.aulas_experimentais
 drop constraint if exists aulas_experimentais_status_check;
alter table public.aulas_experimentais
 add constraint aulas_experimentais_status_check
 check (status in ('Agendada','Confirmada','Realizada','Cancelada'));
commit;
