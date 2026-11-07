-- Complemento aprovado em 2026-11-07: aniversário anual do Estúdio Fênix.
-- Insert-only, idempotente e preserva os registros existentes.
begin;
insert into public.datas_comemorativas(id,nome,data,observacao,ativo,dados_fenix,fenix_version)
select md5('fenix:cal:comm:2027:Aniversário do Estúdio:2027-08-16')::uuid,
       'Aniversário do Estúdio','2027-08-16'::date,null,true,
       '{"data_fim":null,"recorrencia":{"tipo":"fixa","mes":8,"dia":16},"classificacoes":["comemoracao"],"origem":"calendario_aprovado_2027","aprovada2027":true}'::jsonb,0
where not exists(
 select 1 from public.datas_comemorativas
 where nome='Aniversário do Estúdio' and data='2027-08-16'::date
);
commit;
