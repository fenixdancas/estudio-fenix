-- Agenda compartilhada. Aplicar antes de habilitar o agendamento no site.
begin;
create table if not exists public.aulas_experimentais (
 id uuid primary key default gen_random_uuid(),
 nome text not null check (length(trim(nome)) between 1 and 200),
 telefone text not null check (length(trim(telefone)) between 8 and 30),
 modalidade text not null check (length(trim(modalidade)) between 1 and 120),
 data date not null,
 horario time not null,
 professora_id uuid not null references public.professoras(id),
 status text not null default 'Agendada' check (status in ('Agendada','Confirmada')),
 created_at timestamptz not null default now()
);
create index if not exists aulas_experimentais_professora_data_idx on public.aulas_experimentais(professora_id,data);
alter table public.aulas_experimentais enable row level security;
create policy aulas_experimentais_admin on public.aulas_experimentais for all to authenticated
 using (exists(select 1 from public.perfis p where p.id=auth.uid() and p.status='ativo' and p.papel='admin'))
 with check (exists(select 1 from public.perfis p where p.id=auth.uid() and p.status='ativo' and p.papel='admin'));
create policy aulas_experimentais_professora on public.aulas_experimentais for select to authenticated
 using (exists(select 1 from public.perfis p where p.id=auth.uid() and p.status='ativo' and p.papel='professora' and p.professora_id=aulas_experimentais.professora_id));
grant select,insert,update on public.aulas_experimentais to authenticated;
commit;
