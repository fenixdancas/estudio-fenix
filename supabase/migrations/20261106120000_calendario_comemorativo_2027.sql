-- Calendário aprovado do Estúdio Fênix para 2027. Idempotente e preserva registros existentes.
begin;
alter table public.feriados add column if not exists dados_fenix jsonb not null default '{}'::jsonb;
alter table public.feriados add column if not exists fenix_version bigint not null default 0;
alter table public.feriados enable row level security;
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
 when 'feriados' then array['data','nome','abrangencia','tipo','ativo','dados_fenix']
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
  -- Preserve enrollment history using the confirmed production enum.
  update public.matriculas_turmas set status='encerrada',fim_em=(now() at time zone 'America/Sao_Paulo')::date
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
    insert into public.presencas(aula_id,aluna_id,status,dados_fenix) values(p_id,(item->>'aluna_id')::uuid,(item->>'status')::public.status_presenca,item->'dados_fenix');
   else
    update public.presencas set status=(item->>'status')::public.status_presenca,dados_fenix=item->'dados_fenix',fenix_version=fenix_version+1 where id=existing_id;
   end if;
  end loop;
 elsif p_vinculos is not null then raise exception 'Vínculos incompatíveis'; end if;
 return jsonb_build_object('id',p_id,'fenix_version',(result->>'fenix_version')::bigint);
end $$;
create or replace function public.proximo_dia_util(p_data date)
 returns date language plpgsql stable set search_path to 'public' as $$
declare d date := p_data;
begin
 loop
  exit when extract(isodow from d)<6
   and not exists(select 1 from public.feriados f where f.data=d and f.ativo and f.tipo='feriado');
  d:=d+1;
 end loop;
 return d;
end;
$$;
drop trigger if exists fenix_auditar on public.feriados;
create trigger fenix_auditar after insert or update on public.feriados for each row execute function public.fenix_registrar_auditoria();
insert into public.datas_comemorativas(id,nome,data,observacao,ativo,dados_fenix,fenix_version)
select md5('fenix:cal:comm:2027:Ano-Novo:2027-01-01')::uuid,'Ano-Novo','2027-01-01'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":1},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Ano-Novo' and x.data='2027-01-01'::date)
union all
select md5('fenix:cal:comm:2027:Dia de Reis:2027-01-06')::uuid,'Dia de Reis','2027-01-06'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":6},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia de Reis' and x.data='2027-01-06'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional da Educação:2027-01-24')::uuid,'Dia Internacional da Educação','2027-01-24'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":24},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional da Educação' and x.data='2027-01-24'::date)
union all
select md5('fenix:cal:comm:2027:Aniversário de São Paulo:2027-01-25')::uuid,'Aniversário de São Paulo','2027-01-25'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":25},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Aniversário de São Paulo' and x.data='2027-01-25'::date)
union all
select md5('fenix:cal:comm:2027:Carnaval:2027-02-08')::uuid,'Carnaval','2027-02-08'::date,'8 e 9 de fevereiro',true,'{"data_fim":"2027-02-09","recorrencia":{"tipo":"pascoa_intervalo","inicio":-48,"fim":-47},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Carnaval' and x.data='2027-02-08'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional da Mulher:2027-03-08')::uuid,'Dia Internacional da Mulher','2027-03-08'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":3,"dia":8},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional da Mulher' and x.data='2027-03-08'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Poesia:2027-03-21')::uuid,'Dia Mundial da Poesia','2027-03-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":3,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Poesia' and x.data='2027-03-21'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional contra a Discriminação Racial:2027-03-21')::uuid,'Dia Internacional contra a Discriminação Racial','2027-03-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":3,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional contra a Discriminação Racial' and x.data='2027-03-21'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial do Teatro:2027-03-27')::uuid,'Dia Mundial do Teatro','2027-03-27'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":3,"dia":27},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial do Teatro' and x.data='2027-03-27'::date)
union all
select md5('fenix:cal:comm:2027:Páscoa:2027-03-28')::uuid,'Páscoa','2027-03-28'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"pascoa","offset":0},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Páscoa' and x.data='2027-03-28'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial de Conscientização do Autismo:2027-04-02')::uuid,'Dia Mundial de Conscientização do Autismo','2027-04-02'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":2},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial de Conscientização do Autismo' and x.data='2027-04-02'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Atividade Física:2027-04-06')::uuid,'Dia Mundial da Atividade Física','2027-04-06'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":6},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Atividade Física' and x.data='2027-04-06'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Saúde:2027-04-07')::uuid,'Dia Mundial da Saúde','2027-04-07'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":7},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Saúde' and x.data='2027-04-07'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Arte:2027-04-15')::uuid,'Dia Mundial da Arte','2027-04-15'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":15},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Arte' and x.data='2027-04-15'::date)
union all
select md5('fenix:cal:comm:2027:Tiradentes:2027-04-21')::uuid,'Tiradentes','2027-04-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Tiradentes' and x.data='2027-04-21'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial do Livro:2027-04-23')::uuid,'Dia Mundial do Livro','2027-04-23'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":23},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial do Livro' and x.data='2027-04-23'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional da Dança:2027-04-29')::uuid,'Dia Internacional da Dança','2027-04-29'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":29},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional da Dança' and x.data='2027-04-29'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Trabalho:2027-05-01')::uuid,'Dia do Trabalho','2027-05-01'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":5,"dia":1},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Trabalho' and x.data='2027-05-01'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Dança do Ventre:2027-05-08')::uuid,'Dia Mundial da Dança do Ventre','2027-05-08'::date,'Segundo sábado de maio',true,'{"data_fim":null,"recorrencia":{"tipo":"dia_semana_mes","mes":5,"weekday":6,"ordem":2},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Dança do Ventre' and x.data='2027-05-08'::date)
union all
select md5('fenix:cal:comm:2027:Dia das Mães:2027-05-09')::uuid,'Dia das Mães','2027-05-09'::date,'Segundo domingo de maio',true,'{"data_fim":null,"recorrencia":{"tipo":"dia_semana_mes","mes":5,"weekday":0,"ordem":2},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia das Mães' and x.data='2027-05-09'::date)
union all
select md5('fenix:cal:comm:2027:Dia da Dança de Salão:2027-05-15')::uuid,'Dia da Dança de Salão','2027-05-15'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":5,"dia":15},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia da Dança de Salão' and x.data='2027-05-15'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Diversidade Cultural:2027-05-21')::uuid,'Dia Mundial da Diversidade Cultural','2027-05-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":5,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Diversidade Cultural' and x.data='2027-05-21'::date)
union all
select md5('fenix:cal:comm:2027:Corpus Christi:2027-05-27')::uuid,'Corpus Christi','2027-05-27'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"pascoa","offset":60},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Corpus Christi' and x.data='2027-05-27'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional de Luta pela Saúde da Mulher:2027-05-28')::uuid,'Dia Internacional de Luta pela Saúde da Mulher','2027-05-28'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":5,"dia":28},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional de Luta pela Saúde da Mulher' and x.data='2027-05-28'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial do Meio Ambiente:2027-06-05')::uuid,'Dia Mundial do Meio Ambiente','2027-06-05'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":6,"dia":5},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial do Meio Ambiente' and x.data='2027-06-05'::date)
union all
select md5('fenix:cal:comm:2027:Dia dos Namorados:2027-06-12')::uuid,'Dia dos Namorados','2027-06-12'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":6,"dia":12},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia dos Namorados' and x.data='2027-06-12'::date)
union all
select md5('fenix:cal:comm:2027:Dia de Santo Antônio:2027-06-13')::uuid,'Dia de Santo Antônio','2027-06-13'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":6,"dia":13},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia de Santo Antônio' and x.data='2027-06-13'::date)
union all
select md5('fenix:cal:comm:2027:Dia de São João:2027-06-24')::uuid,'Dia de São João','2027-06-24'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":6,"dia":24},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia de São João' and x.data='2027-06-24'::date)
union all
select md5('fenix:cal:comm:2027:Dia de São Pedro:2027-06-29')::uuid,'Dia de São Pedro','2027-06-29'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":6,"dia":29},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia de São Pedro' and x.data='2027-06-29'::date)
union all
select md5('fenix:cal:comm:2027:Festas Juninas:2027-06-01')::uuid,'Festas Juninas','2027-06-01'::date,'Durante junho',true,'{"data_fim":"2027-06-30","recorrencia":{"tipo":"periodo_mes","mes":6},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Festas Juninas' and x.data='2027-06-01'::date)
union all
select md5('fenix:cal:comm:2027:Revolução Constitucionalista:2027-07-09')::uuid,'Revolução Constitucionalista','2027-07-09'::date,'Feriado estadual de São Paulo',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":9},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Revolução Constitucionalista' and x.data='2027-07-09'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial do Rock:2027-07-13')::uuid,'Dia Mundial do Rock','2027-07-13'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":13},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial do Rock' and x.data='2027-07-13'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Amigo:2027-07-20')::uuid,'Dia do Amigo','2027-07-20'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":20},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Amigo' and x.data='2027-07-20'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional do Escritor:2027-07-25')::uuid,'Dia Nacional do Escritor','2027-07-25'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":25},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional do Escritor' and x.data='2027-07-25'::date)
union all
select md5('fenix:cal:comm:2027:Dia dos Avós:2027-07-26')::uuid,'Dia dos Avós','2027-07-26'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":26},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia dos Avós' and x.data='2027-07-26'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional da Amizade:2027-07-30')::uuid,'Dia Internacional da Amizade','2027-07-30'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":30},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional da Amizade' and x.data='2027-07-30'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional da Saúde:2027-08-05')::uuid,'Dia Nacional da Saúde','2027-08-05'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":8,"dia":5},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional da Saúde' and x.data='2027-08-05'::date)
union all
select md5('fenix:cal:comm:2027:Dia dos Pais:2027-08-08')::uuid,'Dia dos Pais','2027-08-08'::date,'Segundo domingo de agosto',true,'{"data_fim":null,"recorrencia":{"tipo":"dia_semana_mes","mes":8,"weekday":0,"ordem":2},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia dos Pais' and x.data='2027-08-08'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Estudante:2027-08-11')::uuid,'Dia do Estudante','2027-08-11'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":8,"dia":11},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Estudante' and x.data='2027-08-11'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Folclore:2027-08-22')::uuid,'Dia do Folclore','2027-08-22'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":8,"dia":22},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Folclore' and x.data='2027-08-22'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Psicólogo:2027-08-27')::uuid,'Dia do Psicólogo','2027-08-27'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":8,"dia":27},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Psicólogo' and x.data='2027-08-27'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Profissional de Educação Física:2027-09-01')::uuid,'Dia do Profissional de Educação Física','2027-09-01'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":1},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Profissional de Educação Física' and x.data='2027-09-01'::date)
union all
select md5('fenix:cal:comm:2027:Independência do Brasil:2027-09-07')::uuid,'Independência do Brasil','2027-09-07'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":7},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Independência do Brasil' and x.data='2027-09-07'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial de Prevenção do Suicídio:2027-09-10')::uuid,'Dia Mundial de Prevenção do Suicídio','2027-09-10'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":10},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial de Prevenção do Suicídio' and x.data='2027-09-10'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional do Teatro:2027-09-19')::uuid,'Dia Nacional do Teatro','2027-09-19'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":19},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional do Teatro' and x.data='2027-09-19'::date)
union all
select md5('fenix:cal:comm:2027:Dia da Árvore:2027-09-21')::uuid,'Dia da Árvore','2027-09-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia da Árvore' and x.data='2027-09-21'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional de Luta da Pessoa com Deficiência:2027-09-21')::uuid,'Dia Nacional de Luta da Pessoa com Deficiência','2027-09-21'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":21},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional de Luta da Pessoa com Deficiência' and x.data='2027-09-21'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Bailarino:2027-09-23')::uuid,'Dia do Bailarino','2027-09-23'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":23},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Bailarino' and x.data='2027-09-23'::date)
union all
select md5('fenix:cal:comm:2027:Dia da Música e da Dança Árabe:2027-09-25')::uuid,'Dia da Música e da Dança Árabe','2027-09-25'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":25},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia da Música e da Dança Árabe' and x.data='2027-09-25'::date)
union all
select md5('fenix:cal:comm:2027:Setembro Amarelo:2027-09-01')::uuid,'Setembro Amarelo','2027-09-01'::date,'Durante setembro',true,'{"data_fim":"2027-09-30","recorrencia":{"tipo":"periodo_mes","mes":9},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Setembro Amarelo' and x.data='2027-09-01'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional da Música:2027-10-01')::uuid,'Dia Internacional da Música','2027-10-01'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":1},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional da Música' and x.data='2027-10-01'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial dos Animais:2027-10-04')::uuid,'Dia Mundial dos Animais','2027-10-04'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":4},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial dos Animais' and x.data='2027-10-04'::date)
union all
select md5('fenix:cal:comm:2027:Dia Mundial da Saúde Mental:2027-10-10')::uuid,'Dia Mundial da Saúde Mental','2027-10-10'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":10},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Mundial da Saúde Mental' and x.data='2027-10-10'::date)
union all
select md5('fenix:cal:comm:2027:Dia das Crianças e Nossa Senhora Aparecida:2027-10-12')::uuid,'Dia das Crianças e Nossa Senhora Aparecida','2027-10-12'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":12},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia das Crianças e Nossa Senhora Aparecida' and x.data='2027-10-12'::date)
union all
select md5('fenix:cal:comm:2027:Dia do Professor:2027-10-15')::uuid,'Dia do Professor','2027-10-15'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":15},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia do Professor' and x.data='2027-10-15'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional do Livro:2027-10-29')::uuid,'Dia Nacional do Livro','2027-10-29'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":29},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional do Livro' and x.data='2027-10-29'::date)
union all
select md5('fenix:cal:comm:2027:Halloween:2027-10-31')::uuid,'Halloween','2027-10-31'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":31},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Halloween' and x.data='2027-10-31'::date)
union all
select md5('fenix:cal:comm:2027:Outubro Rosa:2027-10-01')::uuid,'Outubro Rosa','2027-10-01'::date,'Durante outubro',true,'{"data_fim":"2027-10-31","recorrencia":{"tipo":"periodo_mes","mes":10},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Outubro Rosa' and x.data='2027-10-01'::date)
union all
select md5('fenix:cal:comm:2027:Finados:2027-11-02')::uuid,'Finados','2027-11-02'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":2},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Finados' and x.data='2027-11-02'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional da Cultura:2027-11-05')::uuid,'Dia Nacional da Cultura','2027-11-05'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":5},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional da Cultura' and x.data='2027-11-05'::date)
union all
select md5('fenix:cal:comm:2027:Proclamação da República:2027-11-15')::uuid,'Proclamação da República','2027-11-15'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":15},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Proclamação da República' and x.data='2027-11-15'::date)
union all
select md5('fenix:cal:comm:2027:Dia Nacional de Zumbi e da Consciência Negra:2027-11-20')::uuid,'Dia Nacional de Zumbi e da Consciência Negra','2027-11-20'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":20},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Nacional de Zumbi e da Consciência Negra' and x.data='2027-11-20'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional pela Eliminação da Violência contra as Mulheres:2027-11-25')::uuid,'Dia Internacional pela Eliminação da Violência contra as Mulheres','2027-11-25'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":25},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional pela Eliminação da Violência contra as Mulheres' and x.data='2027-11-25'::date)
union all
select md5('fenix:cal:comm:2027:Novembro Azul:2027-11-01')::uuid,'Novembro Azul','2027-11-01'::date,'Durante novembro',true,'{"data_fim":"2027-11-30","recorrencia":{"tipo":"periodo_mes","mes":11},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Novembro Azul' and x.data='2027-11-01'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional das Pessoas com Deficiência:2027-12-03')::uuid,'Dia Internacional das Pessoas com Deficiência','2027-12-03'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":3},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional das Pessoas com Deficiência' and x.data='2027-12-03'::date)
union all
select md5('fenix:cal:comm:2027:Dia da Família:2027-12-08')::uuid,'Dia da Família','2027-12-08'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":8},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia da Família' and x.data='2027-12-08'::date)
union all
select md5('fenix:cal:comm:2027:Dia Internacional dos Direitos Humanos:2027-12-10')::uuid,'Dia Internacional dos Direitos Humanos','2027-12-10'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":10},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dia Internacional dos Direitos Humanos' and x.data='2027-12-10'::date)
union all
select md5('fenix:cal:comm:2027:Véspera de Natal:2027-12-24')::uuid,'Véspera de Natal','2027-12-24'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":24},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Véspera de Natal' and x.data='2027-12-24'::date)
union all
select md5('fenix:cal:comm:2027:Natal:2027-12-25')::uuid,'Natal','2027-12-25'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":25},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Natal' and x.data='2027-12-25'::date)
union all
select md5('fenix:cal:comm:2027:Réveillon:2027-12-31')::uuid,'Réveillon','2027-12-31'::date,null,true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":31},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Réveillon' and x.data='2027-12-31'::date)
union all
select md5('fenix:cal:comm:2027:Dezembro Vermelho:2027-12-01')::uuid,'Dezembro Vermelho','2027-12-01'::date,'Durante dezembro',true,'{"data_fim":"2027-12-31","recorrencia":{"tipo":"periodo_mes","mes":12},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027"}'::jsonb,0 where not exists(select 1 from public.datas_comemorativas x where x.nome='Dezembro Vermelho' and x.data='2027-12-01'::date);
insert into public.feriados(id,data,nome,abrangencia,tipo,ativo,dados_fenix,fenix_version)
select md5('fenix:cal:holiday:2027:Confraternização Universal:2027-01-01')::uuid,'2027-01-01'::date,'Confraternização Universal','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":1},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Confraternização Universal' and x.data='2027-01-01'::date)
union all
select md5('fenix:cal:holiday:2027:Tiradentes:2027-04-21')::uuid,'2027-04-21'::date,'Tiradentes','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":4,"dia":21},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Tiradentes' and x.data='2027-04-21'::date)
union all
select md5('fenix:cal:holiday:2027:Dia do Trabalho:2027-05-01')::uuid,'2027-05-01'::date,'Dia do Trabalho','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":5,"dia":1},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Dia do Trabalho' and x.data='2027-05-01'::date)
union all
select md5('fenix:cal:holiday:2027:Independência do Brasil:2027-09-07')::uuid,'2027-09-07'::date,'Independência do Brasil','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":9,"dia":7},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Independência do Brasil' and x.data='2027-09-07'::date)
union all
select md5('fenix:cal:holiday:2027:Nossa Senhora Aparecida:2027-10-12')::uuid,'2027-10-12'::date,'Nossa Senhora Aparecida','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":12},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Nossa Senhora Aparecida' and x.data='2027-10-12'::date)
union all
select md5('fenix:cal:holiday:2027:Finados:2027-11-02')::uuid,'2027-11-02'::date,'Finados','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":2},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Finados' and x.data='2027-11-02'::date)
union all
select md5('fenix:cal:holiday:2027:Proclamação da República:2027-11-15')::uuid,'2027-11-15'::date,'Proclamação da República','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":15},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Proclamação da República' and x.data='2027-11-15'::date)
union all
select md5('fenix:cal:holiday:2027:Dia Nacional de Zumbi e da Consciência Negra:2027-11-20')::uuid,'2027-11-20'::date,'Dia Nacional de Zumbi e da Consciência Negra','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":11,"dia":20},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Dia Nacional de Zumbi e da Consciência Negra' and x.data='2027-11-20'::date)
union all
select md5('fenix:cal:holiday:2027:Natal:2027-12-25')::uuid,'2027-12-25'::date,'Natal','nacional','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":25},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Natal' and x.data='2027-12-25'::date)
union all
select md5('fenix:cal:holiday:2027:Data Magna do Estado de São Paulo:2027-07-09')::uuid,'2027-07-09'::date,'Data Magna do Estado de São Paulo','estadual','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":7,"dia":9},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Data Magna do Estado de São Paulo' and x.data='2027-07-09'::date)
union all
select md5('fenix:cal:holiday:2027:Aniversário da Cidade de São Paulo:2027-01-25')::uuid,'2027-01-25'::date,'Aniversário da Cidade de São Paulo','municipal','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":1,"dia":25},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Aniversário da Cidade de São Paulo' and x.data='2027-01-25'::date)
union all
select md5('fenix:cal:holiday:2027:Paixão de Cristo (Sexta-feira Santa):2027-03-26')::uuid,'2027-03-26'::date,'Paixão de Cristo (Sexta-feira Santa)','municipal','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"pascoa","offset":-2},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Paixão de Cristo (Sexta-feira Santa)' and x.data='2027-03-26'::date)
union all
select md5('fenix:cal:holiday:2027:Corpus Christi:2027-05-27')::uuid,'2027-05-27'::date,'Corpus Christi','municipal','feriado',true,'{"data_fim":null,"recorrencia":{"tipo":"pascoa","offset":60},"observacao":""}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Corpus Christi' and x.data='2027-05-27'::date)
union all
select md5('fenix:cal:holiday:2027:Carnaval:2027-02-08')::uuid,'2027-02-08'::date,'Carnaval','federal','ponto_facultativo',true,'{"data_fim":"2027-02-09","recorrencia":{"tipo":"pascoa_intervalo","inicio":-48,"fim":-47},"observacao":"Referência administrativa; confirmar a publicação oficial do calendário de 2027. Este registro não suspende aulas."}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Carnaval' and x.data='2027-02-08'::date)
union all
select md5('fenix:cal:holiday:2027:Quarta-feira de Cinzas:2027-02-10')::uuid,'2027-02-10'::date,'Quarta-feira de Cinzas','federal','ponto_facultativo',true,'{"data_fim":null,"recorrencia":{"tipo":"pascoa","offset":-46},"observacao":"Referência administrativa; confirmar a publicação oficial do calendário de 2027. Este registro não suspende aulas. O horário de expediente poderá ser parcial, conforme o ato oficial."}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Quarta-feira de Cinzas' and x.data='2027-02-10'::date)
union all
select md5('fenix:cal:holiday:2027:Dia do Servidor Público:2027-10-28')::uuid,'2027-10-28'::date,'Dia do Servidor Público','federal','ponto_facultativo',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":10,"dia":28},"observacao":"Referência administrativa; confirmar a publicação oficial do calendário de 2027. Este registro não suspende aulas."}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Dia do Servidor Público' and x.data='2027-10-28'::date)
union all
select md5('fenix:cal:holiday:2027:Véspera de Natal:2027-12-24')::uuid,'2027-12-24'::date,'Véspera de Natal','federal','ponto_facultativo',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":24},"observacao":"Referência administrativa; confirmar a publicação oficial do calendário de 2027. Este registro não suspende aulas."}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Véspera de Natal' and x.data='2027-12-24'::date)
union all
select md5('fenix:cal:holiday:2027:Véspera de Ano-Novo:2027-12-31')::uuid,'2027-12-31'::date,'Véspera de Ano-Novo','federal','ponto_facultativo',true,'{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":12,"dia":31},"observacao":"Referência administrativa; confirmar a publicação oficial do calendário de 2027. Este registro não suspende aulas."}'::jsonb,0 where not exists(select 1 from public.feriados x where x.nome='Véspera de Ano-Novo' and x.data='2027-12-31'::date);
commit;
