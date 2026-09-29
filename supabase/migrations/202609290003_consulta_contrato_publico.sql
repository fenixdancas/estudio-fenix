-- Consulta pública limitada ao contrato identificado por um token aleatório.
begin;
create or replace function public.fenix_consultar_contrato(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_contrato public.contratos%rowtype;
begin
 if p_token is null or trim(p_token)!~'^([0-9a-fA-F]{32}|[0-9a-fA-F]{48})$'
 then return null; end if;
 select * into v_contrato from public.contratos where token_aceite=trim(p_token);
 if not found or v_contrato.status::text not in ('pendente','enviado','aceito') then return null; end if;
 return jsonb_build_object('conteudo',v_contrato.conteudo,'status',v_contrato.status,'aceito_em',v_contrato.aceito_em);
end $$;
revoke all on function public.fenix_consultar_contrato(text) from public;
grant execute on function public.fenix_consultar_contrato(text) to anon,authenticated;
commit;
