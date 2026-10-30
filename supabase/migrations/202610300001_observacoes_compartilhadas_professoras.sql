begin;

create function public.fenix_listar_observacoes_compartilhadas()
returns table(
 id uuid,
 aluna_id uuid,
 autora_id uuid,
 autora_nome text,
 conteudo text,
 created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_papel text;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

 select p.papel::text into v_papel
 from public.perfis p
 where p.id=auth.uid() and p.status='ativo';

 if v_papel is null or v_papel not in ('admin','professora','teacher') then
  raise exception 'Acesso não autorizado';
 end if;

 return query
 select o.id,o.aluna_id,o.autora_id,coalesce(p.nome,'Professora')::text,o.conteudo,o.created_at
 from public.observacoes o
 left join public.perfis p on p.id=o.autora_id
 where o.visibilidade='compartilhada'
   and (v_papel='admin' or public.possui_acesso_aluna(o.aluna_id))
 order by o.created_at desc,o.id;
end
$$;

revoke all on function public.fenix_listar_observacoes_compartilhadas() from public,anon;
grant execute on function public.fenix_listar_observacoes_compartilhadas() to authenticated;

commit;
