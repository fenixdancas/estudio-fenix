-- Aplicar depois de 202609230001, após conferir o esquema e as políticas atuais.
-- As funções elevam somente as duas gravações que as políticas antigas bloqueiam.
begin;

create function public.fenix_salvar_observacao_professora(p_id uuid, p_obs text, p_versao bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_professora uuid; v_versao bigint;
begin
 select professora_id into v_professora from public.perfis
 where id=auth.uid() and status='ativo' and papel='professora';
 if v_professora is null then raise exception 'Acesso de professora necessário'; end if;
 if p_id is null or p_versao<0 or length(p_obs)>100000 then raise exception 'Observação inválida'; end if;
 select fenix_version into v_versao from public.alunas where id=p_id for update;
 if v_versao is null then raise exception 'Aluna não encontrada'; end if;
 if not exists (
  select 1 from public.matriculas_turmas m join public.turmas t on t.id=m.turma_id
  where m.aluna_id=p_id and m.status='ativa' and t.professora_id=v_professora and t.status='ativo'
 ) then raise exception 'Aluna não vinculada'; end if;
 if v_versao<>p_versao then raise exception 'Este registro mudou em outro acesso. Recarregue antes de editar novamente.' using errcode='40001'; end if;
 update public.alunas set dados_fenix=jsonb_set(coalesce(dados_fenix,'{}'::jsonb),'{obs}',to_jsonb(p_obs),true),fenix_version=fenix_version+1 where id=p_id;
 return jsonb_build_object('id',p_id,'fenix_version',v_versao+1);
end $$;

create function public.fenix_salvar_aula_professora(p_id uuid, p_turma uuid, p_data date, p_versao bigint, p_presencas jsonb, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_professora uuid; v_versao bigint; v_turma uuid; item jsonb; v_aluna uuid; v_status text; v_id uuid;
begin
 select professora_id into v_professora from public.perfis
 where id=auth.uid() and status='ativo' and papel='professora';
 if v_professora is null then raise exception 'Acesso de professora necessário'; end if;
 if p_id is null or p_turma is null or p_data is null or p_versao<0
    or jsonb_typeof(p_presencas)<>'array' or jsonb_array_length(p_presencas)>500
    or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>100000
 then raise exception 'Aula inválida'; end if;
 if not exists(select 1 from public.turmas where id=p_turma and professora_id=v_professora and status='ativo')
 then raise exception 'Turma não vinculada'; end if;
 select fenix_version,turma_id into v_versao,v_turma from public.aulas where id=p_id for update;
 if v_versao is null then
  if p_versao<>0 then raise exception 'Aula não encontrada'; end if;
  insert into public.aulas(id,turma_id,data,dados_fenix,fenix_version) values(p_id,p_turma,p_data,p_dados,1);
  v_versao:=0;
 else
  if v_turma<>p_turma then raise exception 'A turma da aula não pode ser trocada'; end if;
  if v_versao<>p_versao then raise exception 'Este registro mudou em outro acesso. Recarregue antes de editar novamente.' using errcode='40001'; end if;
  update public.aulas set data=p_data,dados_fenix=p_dados,fenix_version=fenix_version+1 where id=p_id;
 end if;
 for item in select value from jsonb_array_elements(p_presencas) loop
  if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>3
     or not(item ?& array['aluna_id','status','dados_fenix'])
     or jsonb_typeof(item->'dados_fenix')<>'object'
     or (select count(*) from jsonb_object_keys(item->'dados_fenix'))<>1
     or not(item->'dados_fenix' ? 'status') then raise exception 'Presença inválida'; end if;
  v_aluna:=(item->>'aluna_id')::uuid; v_status:=item->>'status';
  if v_status not in ('presente','ausente') or item->'dados_fenix'->>'status' not in ('Presente','Ausente','Falta justificada','Atestado médico')
     or (v_status='presente')<>(item->'dados_fenix'->>'status'='Presente')
  then raise exception 'Situação de presença inválida'; end if;
  if not exists(select 1 from public.matriculas_turmas where aluna_id=v_aluna and turma_id=p_turma and status='ativa')
  then raise exception 'Aluna não matriculada nesta turma'; end if;
  select id into v_id from public.presencas where aula_id=p_id and aluna_id=v_aluna limit 1;
  if v_id is null then
   insert into public.presencas(aula_id,aluna_id,status,dados_fenix) values(p_id,v_aluna,v_status::public.status_presenca,item->'dados_fenix');
  else
   update public.presencas set status=v_status::public.status_presenca,dados_fenix=item->'dados_fenix',fenix_version=fenix_version+1 where id=v_id;
  end if;
 end loop;
 return jsonb_build_object('id',p_id,'fenix_version',v_versao+1);
end $$;

revoke all on function public.fenix_salvar_observacao_professora(uuid,text,bigint) from public,anon;
revoke all on function public.fenix_salvar_aula_professora(uuid,uuid,date,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.fenix_salvar_observacao_professora(uuid,text,bigint) to authenticated;
grant execute on function public.fenix_salvar_aula_professora(uuid,uuid,date,bigint,jsonb,jsonb) to authenticated;
commit;
