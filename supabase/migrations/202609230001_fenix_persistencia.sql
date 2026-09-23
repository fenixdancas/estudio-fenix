-- REVIEW GATE: apply only after exporting the real schema, backing up data,
-- validating existing RLS and testing this migration on a staging copy.
-- No existing rows or policies are deleted. Runs inside one transaction.
begin;
do $$
declare t text;
begin
 foreach t in array array['professoras','turmas','alunas','financeiro','eventos','datas_comemorativas','aulas','presencas'] loop
  if to_regclass('public.'||t) is null then raise exception 'Tabela necessária ausente: %',t; end if;
  execute format('alter table public.%I add column if not exists dados_fenix jsonb not null default ''{}''::jsonb',t);
  execute format('alter table public.%I add column if not exists fenix_version bigint not null default 0',t);
 end loop;
end $$;

create or replace function public.fenix_salvar_registro(
 p_tabela text,p_id uuid,p_dados jsonb,p_versao bigint,p_vinculos jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 role_name text; teacher_id uuid; current_row jsonb; result jsonb;
 columns_sql text; values_sql text; assignment_sql text; allowed text[];
 class_id uuid; item jsonb; existing_id uuid; desired uuid[]; active_count integer;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 select p.papel::text,p.professora_id into role_name,teacher_id
 from public.perfis p where p.id=auth.uid() and p.status='ativo';
 if role_name is null or role_name not in ('admin','professora','teacher') then raise exception 'Acesso não autorizado'; end if;
 if p_id is null or p_versao<0 or jsonb_typeof(p_dados)<>'object' then raise exception 'Registro inválido'; end if;
 allowed:=case p_tabela
 when 'professoras' then array['nome','telefone','foto_url','status','dados_fenix']
 when 'turmas' then array['nome','modalidade_id','dia_semana','horario','professora_id','status','limite_alunos','observacao','dados_fenix']
 when 'alunas' then array['nome','telefone','email','endereco','data_nascimento','cpf','rg','foto_url','responsavel_nome','responsavel_cpf','responsavel_telefone','responsavel_parentesco','menor','status','dados_fenix']
 when 'financeiro' then array['aluna_id','tipo','descricao','valor','vencimento','status','pago_em','forma_pagamento','dados_fenix']
 when 'eventos' then array['nome','data','local','observacao','turma_id','dados_fenix']
 when 'datas_comemorativas' then array['nome','data','observacao','ativo','dados_fenix']
 when 'aulas' then array['turma_id','data','dados_fenix'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(p_dados) k where not(k=any(allowed))) then raise exception 'Campo ou tabela não permitido'; end if;
 if p_dados ? 'dados_fenix' and jsonb_typeof(p_dados->'dados_fenix')<>'object' then raise exception 'Ficha inválida'; end if;
 if octet_length(p_dados::text)>2000000 then raise exception 'Registro muito grande'; end if;
 -- RLS remains in force: this function does not execute as its owner.
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_tabela) into current_row using p_id;
 if role_name<>'admin' then
  if p_tabela='alunas' then
   if current_row is null or p_vinculos is not null or (p_dados-'dados_fenix')<>'{}'::jsonb
    or exists(select 1 from jsonb_object_keys(p_dados->'dados_fenix') k where k<>'obs') then raise exception 'Somente observações da aula podem ser alteradas'; end if;
   if not exists(select 1 from public.matriculas_turmas m join public.turmas t on t.id=m.turma_id where m.aluna_id=p_id and m.status='ativa' and t.professora_id=teacher_id) then raise exception 'Aluna não vinculada'; end if;
   p_dados=jsonb_build_object('dados_fenix',coalesce(current_row->'dados_fenix','{}'::jsonb)||(p_dados->'dados_fenix'));
  elsif p_tabela='aulas' then
   class_id=coalesce((p_dados->>'turma_id')::uuid,(current_row->>'turma_id')::uuid);
   if not exists(select 1 from public.turmas where id=class_id and professora_id=teacher_id) then raise exception 'Turma não vinculada'; end if;
   if current_row is not null and (current_row->>'turma_id')::uuid<>class_id then raise exception 'A turma da aula não pode ser trocada'; end if;
  else raise exception 'Ação administrativa'; end if;
 end if;
 if current_row is not null and (current_row->>'fenix_version')::bigint<>p_versao then
  raise exception 'Este registro mudou em outro acesso. Recarregue antes de editar novamente.' using errcode='40001';
 end if;
 if current_row is null and p_versao<>0 then raise exception 'Registro não encontrado ou sem permissão'; end if;
 p_dados=p_dados||jsonb_build_object('id',p_id,'fenix_version',p_versao+1);
 select string_agg(format('%I',k),','), string_agg(format('r.%I',k),','), string_agg(format('%1$I=r.%1$I',k),',')
 into columns_sql,values_sql,assignment_sql from jsonb_object_keys(p_dados) k;
 if current_row is null then
  execute format('insert into public.%1$I(%2$s) select %3$s from jsonb_populate_record(null::public.%1$I,$1) r returning to_jsonb(%1$I)',p_tabela,columns_sql,values_sql) into result using p_dados;
 else
  execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I,$1) r where t.id=$2 returning to_jsonb(t)',p_tabela,assignment_sql) into result using p_dados,p_id;
 end if;
 if result is null then raise exception 'O banco recusou o salvamento'; end if;
 if p_vinculos is not null and p_tabela='alunas' then
  if role_name<>'admin' or jsonb_typeof(p_vinculos->'turmas')<>'array' then raise exception 'Vínculos inválidos'; end if;
  select coalesce(array_agg(value::uuid),'{}') into desired from jsonb_array_elements_text(p_vinculos->'turmas');
  -- Preserve the enrollment history. Confirm the live status enum before deployment.
  update public.matriculas_turmas set status='inativa',fim_em=(now() at time zone 'America/Sao_Paulo')::date
   where aluna_id=p_id and status='ativa' and not(turma_id=any(desired));
  foreach class_id in array desired loop
   if not exists(select 1 from public.turmas where id=class_id) then raise exception 'Turma não encontrada'; end if;
   if not exists(select 1 from public.matriculas_turmas where aluna_id=p_id and turma_id=class_id and status='ativa') then
    insert into public.matriculas_turmas(aluna_id,turma_id,status,inicio_em) values(p_id,class_id,'ativa',(now() at time zone 'America/Sao_Paulo')::date);
   end if;
  end loop;
 elsif p_vinculos is not null and p_tabela='aulas' then
  if jsonb_typeof(p_vinculos->'presencas')<>'array' then raise exception 'Presenças inválidas'; end if;
  class_id=(result->>'turma_id')::uuid;
  for item in select value from jsonb_array_elements(p_vinculos->'presencas') loop
   if item->>'status' not in ('presente','ausente') or item->'dados_fenix'->>'status' not in ('Presente','Ausente','Falta justificada','Atestado médico') then raise exception 'Situação de presença inválida'; end if;
   if not exists(select 1 from public.matriculas_turmas where aluna_id=(item->>'aluna_id')::uuid and turma_id=class_id and status='ativa') then raise exception 'Aluna não matriculada nesta turma'; end if;
   select id into existing_id from public.presencas where aula_id=p_id and aluna_id=(item->>'aluna_id')::uuid limit 1;
   if existing_id is null then
    insert into public.presencas(aula_id,aluna_id,status,dados_fenix) values(p_id,(item->>'aluna_id')::uuid,item->>'status',item->'dados_fenix');
   else
    update public.presencas set status=item->>'status',dados_fenix=item->'dados_fenix',fenix_version=fenix_version+1 where id=existing_id;
   end if;
  end loop;
 elsif p_vinculos is not null then raise exception 'Vínculos incompatíveis'; end if;
 return jsonb_build_object('id',p_id,'fenix_version',(result->>'fenix_version')::bigint);
end $$;
revoke all on function public.fenix_salvar_registro(text,uuid,jsonb,bigint,jsonb) from public,anon;
grant execute on function public.fenix_salvar_registro(text,uuid,jsonb,bigint,jsonb) to authenticated;
create table if not exists public.fenix_auditoria(
 id uuid primary key default gen_random_uuid(),
 ator uuid not null, tabela text not null, registro_id uuid not null,
 acao text not null, created_at timestamptz not null default now()
);
alter table public.fenix_auditoria enable row level security;
revoke all on table public.fenix_auditoria from anon,authenticated;
grant select on public.fenix_auditoria to authenticated;
create policy fenix_auditoria_admin on public.fenix_auditoria for select to authenticated
 using(exists(select 1 from public.perfis p where p.id=auth.uid() and p.status='ativo' and p.papel='admin'));
create or replace function public.fenix_registrar_auditoria() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  insert into public.fenix_auditoria(ator,tabela,registro_id,acao)
  values(auth.uid(),tg_table_name,new.id,case tg_op when 'INSERT' then 'Cadastro' else 'Atualização' end);
 end if;
 return new;
end $$;
revoke all on function public.fenix_registrar_auditoria() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['professoras','turmas','alunas','financeiro','eventos','datas_comemorativas','aulas','presencas'] loop
  execute format('create trigger fenix_auditar after insert or update on public.%I for each row execute function public.fenix_registrar_auditoria()',t);
 end loop;
end $$;

commit;
