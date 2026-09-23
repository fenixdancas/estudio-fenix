-- Somente leitura: uma linha por categoria; exporte o resultado completo em CSV.
-- Não consulta registros de alunas, pagamentos ou credenciais.
select 'colunas' as categoria, coalesce(jsonb_agg(to_jsonb(x)), '[]') as dados
from (select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position) x
union all
select 'rls',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','p')) x
union all
select 'politicas',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from pg_policies where schemaname='public') x
union all
select 'permissoes_tabelas',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public') x
union all
select 'enums',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') x
union all
select 'restricoes',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select c.conrelid::regclass::text as tabela,c.conname,pg_get_constraintdef(c.oid) as definicao from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public') x
union all
select 'indices',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select tablename,indexname,indexdef from pg_indexes where schemaname='public') x
union all
select 'gatilhos',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definicao from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) x
union all
select 'views',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select viewname,definition from pg_views where schemaname='public') x
union all
select 'funcoes',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select p.proname,pg_get_function_identity_arguments(p.oid) as argumentos,p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner) as dono,pg_get_functiondef(p.oid) as definicao from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') x
union all
select 'schema',coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select nspname,nspacl from pg_namespace where nspname='public') x;
