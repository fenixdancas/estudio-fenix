-- Cadastro administrativo de pessoas interessadas e conferência diária de contatos.
begin;

create table public.interessadas (
 id uuid primary key default gen_random_uuid(),
 nome text not null check (length(trim(nome)) between 1 and 200),
 telefone text not null check (length(trim(telefone)) between 8 and 30),
 modalidade text not null check (length(trim(modalidade)) between 1 and 120),
 canal_contato text not null check (canal_contato in ('whatsapp','direct')),
 origem text not null check (origem in ('indicacao','instagram','facebook','wellhub','totalpass','google','outros')),
 origem_detalhe text check (origem_detalhe is null or length(trim(origem_detalhe)) <= 250),
 observacoes text check (observacoes is null or length(observacoes) <= 3000),
 status text not null default 'novo' check (status in ('novo','em_atendimento','experimental','matriculada','sem_avanco')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 dados_fenix jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_fenix)='object'),
 fenix_version bigint not null default 0 check (fenix_version >= 0)
);
create index interessadas_created_at_idx on public.interessadas(created_at desc);
alter table public.interessadas enable row level security;
revoke all on table public.interessadas from public, anon, authenticated;
grant select,insert,update on table public.interessadas to authenticated;
create policy interessadas_admin_leitura on public.interessadas for select to authenticated
 using (public.meu_papel() = 'admin'::public.papel_usuario);
create policy interessadas_admin_criacao on public.interessadas for insert to authenticated
 with check (public.meu_papel() = 'admin'::public.papel_usuario);
create policy interessadas_admin_atualizacao on public.interessadas for update to authenticated
 using (public.meu_papel() = 'admin'::public.papel_usuario)
 with check (public.meu_papel() = 'admin'::public.papel_usuario);

create table public.revisoes_contatos_diarias (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references auth.users(id) on delete cascade,
 revisado_em date not null,
 conferido_em timestamptz not null default now(),
 unique (admin_id,revisado_em)
);
create index revisoes_contatos_diarias_admin_data_idx on public.revisoes_contatos_diarias(admin_id,revisado_em desc);
alter table public.revisoes_contatos_diarias enable row level security;
revoke all on table public.revisoes_contatos_diarias from public, anon, authenticated;
grant select,insert on table public.revisoes_contatos_diarias to authenticated;
create policy revisoes_contatos_admin_leitura on public.revisoes_contatos_diarias for select to authenticated
 using (admin_id=auth.uid() and public.meu_papel() = 'admin'::public.papel_usuario);
create policy revisoes_contatos_admin_criacao on public.revisoes_contatos_diarias for insert to authenticated
 with check (admin_id=auth.uid() and public.meu_papel() = 'admin'::public.papel_usuario);

create or replace function public.fenix_salvar_interessada(p_id uuid,p_dados jsonb,p_versao bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 current_row jsonb; result jsonb;
 columns_sql text; values_sql text; assignment_sql text;
 allowed text[] := array['nome','telefone','modalidade','canal_contato','origem','origem_detalhe','observacoes','status','dados_fenix','updated_at'];
begin
 if auth.uid() is null or public.meu_papel() <> 'admin'::public.papel_usuario then raise exception 'Ação administrativa'; end if;
 if p_id is null or p_versao<0 or jsonb_typeof(p_dados)<>'object' then raise exception 'Registro inválido'; end if;
 if exists(select 1 from jsonb_object_keys(p_dados) k where not(k=any(allowed))) then raise exception 'Campo não permitido'; end if;
 if p_dados ? 'dados_fenix' and jsonb_typeof(p_dados->'dados_fenix')<>'object' then raise exception 'Ficha inválida'; end if;
 if octet_length(p_dados::text)>200000 then raise exception 'Registro muito grande'; end if;
 execute 'select to_jsonb(t) from public.interessadas t where id=$1 for update' into current_row using p_id;
 if current_row is not null and (current_row->>'fenix_version')::bigint<>p_versao then
  raise exception 'Este contato mudou em outro acesso. Recarregue antes de editar novamente.' using errcode='40001';
 end if;
 if current_row is null and p_versao<>0 then raise exception 'Registro não encontrado ou sem permissão'; end if;
 p_dados=p_dados||jsonb_build_object('id',p_id,'fenix_version',p_versao+1,'updated_at',now());
 select string_agg(format('%I',k),','),string_agg(format('r.%I',k),','),string_agg(format('%1$I=r.%1$I',k),',')
 into columns_sql,values_sql,assignment_sql from jsonb_object_keys(p_dados) k;
 if current_row is null then
  execute format('insert into public.interessadas(%s) select %s from jsonb_populate_record(null::public.interessadas,$1) r returning to_jsonb(interessadas)',columns_sql,values_sql) into result using p_dados;
 else
  execute format('update public.interessadas t set %s from jsonb_populate_record(null::public.interessadas,$1) r where t.id=$2 returning to_jsonb(t)',assignment_sql) into result using p_dados,p_id;
 end if;
 if result is null then raise exception 'O banco recusou o salvamento'; end if;
 return jsonb_build_object('id',p_id,'fenix_version',(result->>'fenix_version')::bigint);
end $$;
revoke all on function public.fenix_salvar_interessada(uuid,jsonb,bigint) from public,anon;
grant execute on function public.fenix_salvar_interessada(uuid,jsonb,bigint) to authenticated;

drop trigger if exists fenix_auditar on public.interessadas;
create trigger fenix_auditar after insert or update on public.interessadas
 for each row execute function public.fenix_registrar_auditoria();

commit;
