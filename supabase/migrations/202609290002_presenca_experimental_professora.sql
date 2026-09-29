-- A professora altera apenas o comparecimento de sua própria experimental.
begin;
create or replace function public.fenix_registrar_presenca_experimental(p_id uuid, p_presenca text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_professora uuid; v_registro public.aulas_experimentais%rowtype;
begin
 select professora_id into v_professora from public.perfis
 where id=auth.uid() and status='ativo' and papel='professora';
 if v_professora is null then raise exception 'Acesso de professora necessário'; end if;
 if p_presenca not in ('Compareceu','Não compareceu') or p_presenca is null
 then raise exception 'Comparecimento inválido'; end if;
 select * into v_registro from public.aulas_experimentais where id=p_id for update;
 if not found or v_registro.professora_id<>v_professora
 then raise exception 'Experimental não vinculada à professora'; end if;
 update public.aulas_experimentais
 set dados_fenix=jsonb_set(coalesce(dados_fenix,'{}'::jsonb),'{presenca}',to_jsonb(p_presenca),true)
 where id=p_id;
 return jsonb_build_object('id',p_id,'presenca',p_presenca);
end $$;
revoke all on function public.fenix_registrar_presenca_experimental(uuid,text) from public,anon;
grant execute on function public.fenix_registrar_presenca_experimental(uuid,text) to authenticated;
commit;
