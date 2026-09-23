-- Read-only: schema, grants and policies. Contains no student rows or secrets.
select table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' order by table_name,ordinal_position;
select n.nspname as schema,c.relname as tabela,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public';
select table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and grantee in ('anon','authenticated') order by table_name,grantee;
select t.typname,e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid order by t.typname,e.enumsortorder;
select routine_name,security_type from information_schema.routines where routine_schema='public';
