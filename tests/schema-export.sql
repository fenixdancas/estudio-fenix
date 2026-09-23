-- Reconstructed from metadata exported 2026-09-23. No customer rows.
-- pgcrypto token default substituted for local tests only.
create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon;
create type public."papel_usuario" as enum ('admin','professora');
create type public."status_ativo" as enum ('ativo','inativo');
create type public."visibilidade_observacao" as enum ('privada','compartilhada','administrativa');
create type public."status_presenca" as enum ('presente','ausente');
create type public."status_matricula" as enum ('ativa','encerrada','transferida','cancelada');
create type public."status_financeiro" as enum ('em_aberto','pago','negociado','cancelado');
create type public."tipo_lancamento" as enum ('mensalidade','entrada','saida');
create type public."canal_comunicacao" as enum ('whatsapp','email');
create type public."status_comunicacao" as enum ('pendente','enviado','entregue','lido','erro');
create type public."status_contrato" as enum ('pendente','enviado','aceito','recusado','expirado');
create table public."alunas"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"telefone" "text","email" "text","endereco" "text","data_nascimento" "date","cpf" "text","rg" "text","foto_url" "text","responsavel_nome" "text","responsavel_cpf" "text","responsavel_telefone" "text","responsavel_parentesco" "text","menor" "bool" not null default false,"status" public."status_ativo" not null default 'ativo'::status_ativo,"data_matricula" "date","data_cancelamento" "date","motivo_cancelamento" "text","created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."auditoria"("id" "uuid" not null default gen_random_uuid(),"usuario_id" "uuid","entidade" "text" not null,"registro_id" "uuid","acao" "text" not null,"dados_anteriores" "jsonb","dados_novos" "jsonb","criado_em" "timestamptz" not null default now());
create table public."aulas"("id" "uuid" not null default gen_random_uuid(),"turma_id" "uuid" not null,"data" "date" not null,"horario" "time","cancelada" "bool" not null default false,"motivo_cancelamento" "text","created_at" "timestamptz" not null default now());
create table public."comunicacoes"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid","contrato_id" "uuid","contato" "text","tipo" "text" not null,"conteudo" "text" not null,"canal" public."canal_comunicacao" not null,"status" public."status_comunicacao" not null,"enviado_em" "timestamptz" not null default now(),"identificador_externo" "text","resposta" "jsonb");
create table public."contratos"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"versao" "text" not null,"conteudo" "text" not null,"token_aceite" "text" not null default replace(gen_random_uuid()::text,'-',''),"status" public."status_contrato" not null default 'pendente'::status_contrato,"enviado_em" "timestamptz","ultima_cobranca_em" "timestamptz","aceito_em" "timestamptz","aceito_por_nome" "text","aceito_por_documento" "text","created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."datas_comemorativas"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"data" "date" not null,"observacao" "text","ativo" "bool" not null default true);
create table public."eventos"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"data" "date" not null,"horario" "time","local" "text","turma_id" "uuid" not null,"observacao" "text","lembrete_7_enviado_em" "timestamptz","lembrete_2_enviado_em" "timestamptz","created_at" "timestamptz" not null default now());
create table public."feriados"("id" "uuid" not null default gen_random_uuid(),"data" "date" not null,"nome" "text" not null,"abrangencia" "text" not null,"tipo" "text" not null,"ativo" "bool" not null default true);
create table public."fichas_saude"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"versao" "int4" not null default 1,"vigente" "bool" not null default true,"alergias" "text","alergias_quais" "text","cirurgias" "text","cirurgias_quais" "text","fobias" "text","fobias_quais" "text","restricoes_limitacoes" "text","observacoes" "text","preenchida_em" "date" not null default CURRENT_DATE,"valida_ate" "date" not null,"ultima_notificacao_em" "timestamptz","created_at" "timestamptz" not null default now());
create table public."financeiro"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid","tipo" public."tipo_lancamento" not null,"descricao" "text" not null,"valor" "numeric" not null,"vencimento" "date","status" public."status_financeiro" not null default 'em_aberto'::status_financeiro,"pago_em" "timestamptz","forma_pagamento" "text","desconto" "numeric" not null default 0,"bolsa" "numeric" not null default 0,"multa" "numeric" not null default 0,"juros" "numeric" not null default 0,"valor_atualizado" "numeric","negociacao_valor" "numeric","negociacao_data" "date","ultima_cobranca_em" "timestamptz","proxima_cobranca_em" "timestamptz","created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."historico_presencas"("id" "uuid" not null default gen_random_uuid(),"presenca_id" "uuid" not null,"status_anterior" public."status_presenca","status_novo" public."status_presenca" not null,"alterado_por" "uuid","alterado_em" "timestamptz" not null default now());
create table public."historico_turmas_professoras"("id" "uuid" not null default gen_random_uuid(),"turma_id" "uuid" not null,"professora_id" "uuid" not null,"inicio_em" "timestamptz" not null default now(),"fim_em" "timestamptz","motivo" "text");
create table public."lista_espera"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"turma_id" "uuid" not null,"entrou_em" "timestamptz" not null default now(),"saiu_em" "timestamptz","motivo_saida" "text");
create table public."matriculas_planos"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"plano_id" "uuid" not null,"inicio_em" "date" not null,"fim_em" "date","created_at" "timestamptz" not null default now());
create table public."matriculas_turmas"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"turma_id" "uuid" not null,"inicio_em" "date" not null default CURRENT_DATE,"fim_em" "date","status" public."status_matricula" not null default 'ativa'::status_matricula,"motivo" "text","created_at" "timestamptz" not null default now());
create table public."modalidades"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"status" public."status_ativo" not null default 'ativo'::status_ativo,"created_at" "timestamptz" not null default now());
create table public."observacoes"("id" "uuid" not null default gen_random_uuid(),"aluna_id" "uuid" not null,"autora_id" "uuid" not null,"visibilidade" public."visibilidade_observacao" not null,"conteudo" "text" not null,"created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."perfis"("id" "uuid" not null,"professora_id" "uuid","nome" "text" not null,"papel" public."papel_usuario" not null default 'professora'::papel_usuario,"status" public."status_ativo" not null default 'ativo'::status_ativo,"created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."planos"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"aulas_semana" "int4","valor" "numeric" not null,"exclui_infantil" "bool" not null default false,"status" public."status_ativo" not null default 'ativo'::status_ativo,"created_at" "timestamptz" not null default now());
create table public."presencas"("id" "uuid" not null default gen_random_uuid(),"aula_id" "uuid" not null,"aluna_id" "uuid" not null,"status" public."status_presenca" not null,"created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."professoras"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"telefone" "text","data_nascimento" "date","foto_url" "text","status" public."status_ativo" not null default 'ativo'::status_ativo,"created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
create table public."professoras_modalidades"("professora_id" "uuid" not null,"modalidade_id" "uuid" not null);
create table public."turmas"("id" "uuid" not null default gen_random_uuid(),"nome" "text" not null,"modalidade_id" "uuid" not null,"dia_semana" "int2" not null,"horario" "time" not null,"professora_id" "uuid","status" public."status_ativo" not null default 'ativo'::status_ativo,"limite_alunos" "int4" not null default 0,"observacao" "text","created_at" "timestamptz" not null default now(),"updated_at" "timestamptz" not null default now());
alter table public."professoras" add constraint "professoras_pkey" PRIMARY KEY (id);
alter table public."perfis" add constraint "perfis_pkey" PRIMARY KEY (id);
alter table public."modalidades" add constraint "modalidades_pkey" PRIMARY KEY (id);
alter table public."modalidades" add constraint "modalidades_nome_key" UNIQUE (nome);
alter table public."professoras_modalidades" add constraint "professoras_modalidades_pkey" PRIMARY KEY (professora_id, modalidade_id);
alter table public."turmas" add constraint "turmas_dia_semana_check" CHECK (((dia_semana >= 0) AND (dia_semana <= 6)));
alter table public."turmas" add constraint "turmas_limite_alunos_check" CHECK ((limite_alunos >= 0));
alter table public."turmas" add constraint "turmas_pkey" PRIMARY KEY (id);
alter table public."historico_turmas_professoras" add constraint "historico_turmas_professoras_pkey" PRIMARY KEY (id);
alter table public."alunas" add constraint "alunas_pkey" PRIMARY KEY (id);
alter table public."matriculas_turmas" add constraint "matriculas_turmas_pkey" PRIMARY KEY (id);
alter table public."planos" add constraint "planos_valor_check" CHECK ((valor >= (0)::numeric));
alter table public."planos" add constraint "planos_pkey" PRIMARY KEY (id);
alter table public."planos" add constraint "planos_nome_key" UNIQUE (nome);
alter table public."matriculas_planos" add constraint "matriculas_planos_pkey" PRIMARY KEY (id);
alter table public."aulas" add constraint "aulas_pkey" PRIMARY KEY (id);
alter table public."aulas" add constraint "aulas_turma_id_data_key" UNIQUE (turma_id, data);
alter table public."presencas" add constraint "presencas_pkey" PRIMARY KEY (id);
alter table public."presencas" add constraint "presencas_aula_id_aluna_id_key" UNIQUE (aula_id, aluna_id);
alter table public."historico_presencas" add constraint "historico_presencas_pkey" PRIMARY KEY (id);
alter table public."fichas_saude" add constraint "fichas_saude_versao_check" CHECK ((versao > 0));
alter table public."fichas_saude" add constraint "fichas_saude_pkey" PRIMARY KEY (id);
alter table public."fichas_saude" add constraint "fichas_saude_aluna_id_versao_key" UNIQUE (aluna_id, versao);
alter table public."observacoes" add constraint "observacoes_pkey" PRIMARY KEY (id);
alter table public."financeiro" add constraint "financeiro_valor_check" CHECK ((valor >= (0)::numeric));
alter table public."financeiro" add constraint "financeiro_pkey" PRIMARY KEY (id);
alter table public."contratos" add constraint "contratos_pkey" PRIMARY KEY (id);
alter table public."contratos" add constraint "contratos_token_aceite_key" UNIQUE (token_aceite);
alter table public."comunicacoes" add constraint "comunicacoes_pkey" PRIMARY KEY (id);
alter table public."eventos" add constraint "eventos_pkey" PRIMARY KEY (id);
alter table public."datas_comemorativas" add constraint "datas_comemorativas_pkey" PRIMARY KEY (id);
alter table public."lista_espera" add constraint "lista_espera_pkey" PRIMARY KEY (id);
alter table public."feriados" add constraint "feriados_tipo_check" CHECK ((tipo = ANY (ARRAY['feriado'::text, 'ponto_facultativo'::text])));
alter table public."feriados" add constraint "feriados_pkey" PRIMARY KEY (id);
alter table public."feriados" add constraint "feriados_data_nome_key" UNIQUE (data, nome);
alter table public."auditoria" add constraint "auditoria_pkey" PRIMARY KEY (id);
alter table public."perfis" add constraint "perfis_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."perfis" add constraint "perfis_professora_id_fkey" FOREIGN KEY (professora_id) REFERENCES professoras(id) ON DELETE RESTRICT;
alter table public."professoras_modalidades" add constraint "professoras_modalidades_professora_id_fkey" FOREIGN KEY (professora_id) REFERENCES professoras(id) ON DELETE RESTRICT;
alter table public."professoras_modalidades" add constraint "professoras_modalidades_modalidade_id_fkey" FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE RESTRICT;
alter table public."turmas" add constraint "turmas_modalidade_id_fkey" FOREIGN KEY (modalidade_id) REFERENCES modalidades(id) ON DELETE RESTRICT;
alter table public."turmas" add constraint "turmas_professora_id_fkey" FOREIGN KEY (professora_id) REFERENCES professoras(id) ON DELETE RESTRICT;
alter table public."historico_turmas_professoras" add constraint "historico_turmas_professoras_turma_id_fkey" FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE RESTRICT;
alter table public."historico_turmas_professoras" add constraint "historico_turmas_professoras_professora_id_fkey" FOREIGN KEY (professora_id) REFERENCES professoras(id) ON DELETE RESTRICT;
alter table public."matriculas_turmas" add constraint "matriculas_turmas_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."matriculas_turmas" add constraint "matriculas_turmas_turma_id_fkey" FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE RESTRICT;
alter table public."matriculas_planos" add constraint "matriculas_planos_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."matriculas_planos" add constraint "matriculas_planos_plano_id_fkey" FOREIGN KEY (plano_id) REFERENCES planos(id) ON DELETE RESTRICT;
alter table public."aulas" add constraint "aulas_turma_id_fkey" FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE RESTRICT;
alter table public."presencas" add constraint "presencas_aula_id_fkey" FOREIGN KEY (aula_id) REFERENCES aulas(id) ON DELETE RESTRICT;
alter table public."presencas" add constraint "presencas_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."historico_presencas" add constraint "historico_presencas_presenca_id_fkey" FOREIGN KEY (presenca_id) REFERENCES presencas(id) ON DELETE RESTRICT;
alter table public."historico_presencas" add constraint "historico_presencas_alterado_por_fkey" FOREIGN KEY (alterado_por) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."fichas_saude" add constraint "fichas_saude_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."observacoes" add constraint "observacoes_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."observacoes" add constraint "observacoes_autora_id_fkey" FOREIGN KEY (autora_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."financeiro" add constraint "financeiro_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."contratos" add constraint "contratos_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."comunicacoes" add constraint "comunicacoes_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."comunicacoes" add constraint "comunicacoes_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE RESTRICT;
alter table public."eventos" add constraint "eventos_turma_id_fkey" FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE RESTRICT;
alter table public."lista_espera" add constraint "lista_espera_aluna_id_fkey" FOREIGN KEY (aluna_id) REFERENCES alunas(id) ON DELETE RESTRICT;
alter table public."lista_espera" add constraint "lista_espera_turma_id_fkey" FOREIGN KEY (turma_id) REFERENCES turmas(id) ON DELETE RESTRICT;
alter table public."auditoria" add constraint "auditoria_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.meu_papel()
 RETURNS papel_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select papel
  from public.perfis
  where id = auth.uid()
    and status = 'ativo'
$function$
;
CREATE OR REPLACE FUNCTION public.minhas_turmas()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id
  from public.turmas t
  join public.perfis p on p.professora_id = t.professora_id
  where p.id = auth.uid()
    and p.status = 'ativo'
    and t.status = 'ativo'
$function$
;
CREATE OR REPLACE FUNCTION public.possui_acesso_aluna(p_aluna_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.meu_papel() = 'admin'
    or exists (
      select 1
      from public.matriculas_turmas mt
      where mt.aluna_id = p_aluna_id
        and mt.turma_id in (select public.minhas_turmas())
        and mt.status = 'ativa'
    )
$function$
;
CREATE OR REPLACE FUNCTION public.aceitar_contrato(p_token text, p_nome text, p_documento text)
 RETURNS status_contrato
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_status public.status_contrato;
begin
  if nullif(trim(p_token),'') is null
     or nullif(trim(p_nome),'') is null
     or nullif(trim(p_documento),'') is null then
    raise exception 'Dados de aceite incompletos';
  end if;

  update public.contratos
     set status = 'aceito',
         aceito_em = now(),
         aceito_por_nome = trim(p_nome),
         aceito_por_documento = trim(p_documento)
   where token_aceite = trim(p_token)
     and status in ('pendente','enviado');

  if not found then
    raise exception 'Contrato inexistente ou nÃ£o disponÃ­vel para aceite';
  end if;

  select status into v_status
    from public.contratos
   where token_aceite = trim(p_token);

  return v_status;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.abrir_versao_ficha_saude()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.fichas_saude
     set vigente = false
   where aluna_id = new.aluna_id
     and vigente = true
     and id <> new.id;

  select coalesce(max(fs.versao), 0) + 1
    into new.versao
    from public.fichas_saude fs
   where fs.aluna_id = new.aluna_id;

  new.vigente := true;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_historico_presenca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.historico_presencas(
      presenca_id, status_anterior, status_novo, alterado_por
    ) values (
      new.id, old.status, new.status, auth.uid()
    );
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.calcular_valor_atualizado(p_valor numeric, p_vencimento date, p_data date DEFAULT CURRENT_DATE)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_vencimento is null or p_data <= p_vencimento then round(coalesce(p_valor,0),2)
    else round(coalesce(p_valor,0) * (1 + 0.05 + (greatest(p_data - p_vencimento,0) * 0.01)), 2)
  end
$function$
;
CREATE OR REPLACE FUNCTION public.proximo_dia_util(p_data date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare d date := p_data;
begin
  loop
    exit when extract(isodow from d) < 6
      and not exists (select 1 from public.feriados f where f.data = d and f.ativo);
    d := d + 1;
  end loop;
  return d;
end;
$function$
;
CREATE TRIGGER trg_professoras_updated_at BEFORE UPDATE ON public.professoras FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_perfis_updated_at BEFORE UPDATE ON public.perfis FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_alunas_updated_at BEFORE UPDATE ON public.alunas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_turmas_updated_at BEFORE UPDATE ON public.turmas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_presencas_updated_at BEFORE UPDATE ON public.presencas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_observacoes_updated_at BEFORE UPDATE ON public.observacoes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_financeiro_updated_at BEFORE UPDATE ON public.financeiro FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_contratos_updated_at BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_ficha_saude_vigencia BEFORE INSERT ON public.fichas_saude FOR EACH ROW EXECUTE FUNCTION abrir_versao_ficha_saude();
CREATE TRIGGER trg_presenca_historico AFTER UPDATE OF status ON public.presencas FOR EACH ROW EXECUTE FUNCTION registrar_historico_presenca();
create view public."financeiro_atualizado" with (security_invoker=true) as  SELECT id,
    aluna_id,
    tipo,
    descricao,
    valor,
    vencimento,
    status,
    pago_em,
    forma_pagamento,
    desconto,
    bolsa,
    multa,
    juros,
    valor_atualizado,
    negociacao_valor,
    negociacao_data,
    ultima_cobranca_em,
    proxima_cobranca_em,
    created_at,
    updated_at,
    calcular_valor_atualizado(GREATEST(((valor - desconto) - bolsa), (0)::numeric), vencimento, CURRENT_DATE) AS valor_calculado_atual
   FROM financeiro f;
create view public."timeline_aluna" with (security_invoker=true) as  SELECT matriculas_turmas.aluna_id,
    matriculas_turmas.created_at AS ocorrido_em,
    'matricula_turma'::text AS tipo,
    matriculas_turmas.id AS registro_id,
    (matriculas_turmas.status)::text AS descricao
   FROM matriculas_turmas
UNION ALL
 SELECT financeiro.aluna_id,
    financeiro.pago_em AS ocorrido_em,
    'pagamento'::text AS tipo,
    financeiro.id AS registro_id,
    COALESCE(financeiro.descricao, (financeiro.status)::text) AS descricao
   FROM financeiro
  WHERE (financeiro.pago_em IS NOT NULL)
UNION ALL
 SELECT contratos.aluna_id,
    contratos.created_at AS ocorrido_em,
    'contrato'::text AS tipo,
    contratos.id AS registro_id,
    (contratos.status)::text AS descricao
   FROM contratos
UNION ALL
 SELECT comunicacoes.aluna_id,
    comunicacoes.enviado_em AS ocorrido_em,
    'comunicacao'::text AS tipo,
    comunicacoes.id AS registro_id,
    comunicacoes.tipo AS descricao
   FROM comunicacoes
UNION ALL
 SELECT observacoes.aluna_id,
    observacoes.created_at AS ocorrido_em,
    'observacao'::text AS tipo,
    observacoes.id AS registro_id,
    (observacoes.visibilidade)::text AS descricao
   FROM observacoes
UNION ALL
 SELECT fichas_saude.aluna_id,
    fichas_saude.created_at AS ocorrido_em,
    'saude'::text AS tipo,
    fichas_saude.id AS registro_id,
    ('versÃ£o '::text || (fichas_saude.versao)::text) AS descricao
   FROM fichas_saude;
alter table public."presencas" enable row level security;
alter table public."historico_presencas" enable row level security;
alter table public."fichas_saude" enable row level security;
alter table public."observacoes" enable row level security;
alter table public."financeiro" enable row level security;
alter table public."contratos" enable row level security;
alter table public."comunicacoes" enable row level security;
alter table public."professoras" enable row level security;
alter table public."perfis" enable row level security;
alter table public."modalidades" enable row level security;
alter table public."professoras_modalidades" enable row level security;
alter table public."turmas" enable row level security;
alter table public."historico_turmas_professoras" enable row level security;
alter table public."alunas" enable row level security;
alter table public."matriculas_turmas" enable row level security;
alter table public."planos" enable row level security;
alter table public."matriculas_planos" enable row level security;
alter table public."aulas" enable row level security;
alter table public."eventos" enable row level security;
alter table public."datas_comemorativas" enable row level security;
alter table public."lista_espera" enable row level security;
alter table public."feriados" enable row level security;
alter table public."auditoria" enable row level security;
create policy "admin exclui presenca" on public."presencas" for DELETE to "authenticated" using ((meu_papel() = 'admin'::papel_usuario));
create policy "admin insere presenca" on public."presencas" for INSERT to "authenticated" with check ((meu_papel() = 'admin'::papel_usuario));
create policy "presenca no escopo" on public."presencas" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (EXISTS ( SELECT 1
   FROM aulas a
  WHERE ((a.id = presencas.aula_id) AND (a.turma_id IN ( SELECT minhas_turmas() AS minhas_turmas)))))));
create policy "professora altera presenca da propria turma" on public."presencas" for UPDATE to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (EXISTS ( SELECT 1
   FROM aulas a
  WHERE ((a.id = presencas.aula_id) AND (a.turma_id IN ( SELECT minhas_turmas() AS minhas_turmas))))))) with check (((meu_papel() = 'admin'::papel_usuario) OR (EXISTS ( SELECT 1
   FROM aulas a
  WHERE ((a.id = presencas.aula_id) AND (a.turma_id IN ( SELECT minhas_turmas() AS minhas_turmas)))))));
create policy "historico presenca" on public."historico_presencas" for SELECT to "authenticated" using ((meu_papel() = 'admin'::papel_usuario));
create policy "admin gerencia saude" on public."fichas_saude" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "saude no escopo" on public."fichas_saude" for SELECT to "authenticated" using (possui_acesso_aluna(aluna_id));
create policy "autora ou admin altera observacao" on public."observacoes" for UPDATE to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (autora_id = auth.uid()))) with check (((meu_papel() = 'admin'::papel_usuario) OR (autora_id = auth.uid())));
create policy "observacoes no escopo" on public."observacoes" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (possui_acesso_aluna(aluna_id) AND ((visibilidade = 'compartilhada'::visibilidade_observacao) OR ((visibilidade = 'privada'::visibilidade_observacao) AND (autora_id = auth.uid()))))));
create policy "professora cria observacao" on public."observacoes" for INSERT to "authenticated" with check (((autora_id = auth.uid()) AND ((meu_papel() = 'admin'::papel_usuario) OR possui_acesso_aluna(aluna_id))));
create policy "admin financeiro" on public."financeiro" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin contratos" on public."contratos" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin comunicacoes" on public."comunicacoes" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin gerencia professoras" on public."professoras" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "professora ve proprio cadastro ou admin" on public."professoras" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (id = ( SELECT perfis.professora_id
   FROM perfis
  WHERE (perfis.id = auth.uid())))));
create policy "admin gerencia perfis" on public."perfis" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "perfil proprio ou admin" on public."perfis" for SELECT to "authenticated" using (((id = auth.uid()) OR (meu_papel() = 'admin'::papel_usuario)));
create policy "admin gerencia modalidades" on public."modalidades" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "autenticados veem modalidades" on public."modalidades" for SELECT to "authenticated" using (true);
create policy "admin gerencia modalidades das professoras" on public."professoras_modalidades" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "professoras veem proprias modalidades" on public."professoras_modalidades" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (professora_id = ( SELECT perfis.professora_id
   FROM perfis
  WHERE (perfis.id = auth.uid())))));
create policy "admin gerencia turmas" on public."turmas" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "turmas no escopo" on public."turmas" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (professora_id = ( SELECT perfis.professora_id
   FROM perfis
  WHERE (perfis.id = auth.uid())))));
create policy "historico turma" on public."historico_turmas_professoras" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (turma_id IN ( SELECT minhas_turmas() AS minhas_turmas))));
create policy "admin gerencia alunas" on public."alunas" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "alunas no escopo" on public."alunas" for SELECT to "authenticated" using (possui_acesso_aluna(id));
create policy "admin gerencia matriculas" on public."matriculas_turmas" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "matriculas no escopo" on public."matriculas_turmas" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (turma_id IN ( SELECT minhas_turmas() AS minhas_turmas))));
create policy "admin planos" on public."planos" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "planos leitura" on public."planos" for SELECT to "authenticated" using (true);
create policy "admin matriculas planos" on public."matriculas_planos" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin gerencia aulas" on public."aulas" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "aulas no escopo" on public."aulas" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (turma_id IN ( SELECT minhas_turmas() AS minhas_turmas))));
create policy "admin eventos" on public."eventos" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "professoras veem eventos da propria turma" on public."eventos" for SELECT to "authenticated" using (((meu_papel() = 'admin'::papel_usuario) OR (turma_id IN ( SELECT minhas_turmas() AS minhas_turmas))));
create policy "admin datas" on public."datas_comemorativas" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin lista espera" on public."lista_espera" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin feriados" on public."feriados" for ALL to "authenticated" using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy "admin auditoria" on public."auditoria" for SELECT to "authenticated" using ((meu_papel() = 'admin'::papel_usuario));
grant INSERT on public."presencas" to "authenticated";
grant SELECT on public."presencas" to "authenticated";
grant UPDATE on public."presencas" to "authenticated";
grant DELETE on public."presencas" to "authenticated";
grant INSERT on public."historico_presencas" to "authenticated";
grant SELECT on public."historico_presencas" to "authenticated";
grant UPDATE on public."historico_presencas" to "authenticated";
grant DELETE on public."historico_presencas" to "authenticated";
grant INSERT on public."fichas_saude" to "authenticated";
grant SELECT on public."fichas_saude" to "authenticated";
grant UPDATE on public."fichas_saude" to "authenticated";
grant DELETE on public."fichas_saude" to "authenticated";
grant INSERT on public."observacoes" to "authenticated";
grant SELECT on public."observacoes" to "authenticated";
grant UPDATE on public."observacoes" to "authenticated";
grant DELETE on public."observacoes" to "authenticated";
grant INSERT on public."financeiro" to "authenticated";
grant SELECT on public."financeiro" to "authenticated";
grant UPDATE on public."financeiro" to "authenticated";
grant DELETE on public."financeiro" to "authenticated";
grant INSERT on public."contratos" to "authenticated";
grant SELECT on public."contratos" to "authenticated";
grant UPDATE on public."contratos" to "authenticated";
grant DELETE on public."contratos" to "authenticated";
grant INSERT on public."comunicacoes" to "authenticated";
grant SELECT on public."comunicacoes" to "authenticated";
grant UPDATE on public."comunicacoes" to "authenticated";
grant DELETE on public."comunicacoes" to "authenticated";
grant INSERT on public."financeiro_atualizado" to "anon";
grant SELECT on public."financeiro_atualizado" to "anon";
grant UPDATE on public."financeiro_atualizado" to "anon";
grant DELETE on public."financeiro_atualizado" to "anon";
grant TRUNCATE on public."financeiro_atualizado" to "anon";
grant REFERENCES on public."financeiro_atualizado" to "anon";
grant TRIGGER on public."financeiro_atualizado" to "anon";
grant INSERT on public."financeiro_atualizado" to "authenticated";
grant SELECT on public."financeiro_atualizado" to "authenticated";
grant UPDATE on public."financeiro_atualizado" to "authenticated";
grant DELETE on public."financeiro_atualizado" to "authenticated";
grant TRUNCATE on public."financeiro_atualizado" to "authenticated";
grant REFERENCES on public."financeiro_atualizado" to "authenticated";
grant TRIGGER on public."financeiro_atualizado" to "authenticated";
grant INSERT on public."timeline_aluna" to "anon";
grant SELECT on public."timeline_aluna" to "anon";
grant UPDATE on public."timeline_aluna" to "anon";
grant DELETE on public."timeline_aluna" to "anon";
grant TRUNCATE on public."timeline_aluna" to "anon";
grant REFERENCES on public."timeline_aluna" to "anon";
grant TRIGGER on public."timeline_aluna" to "anon";
grant INSERT on public."timeline_aluna" to "authenticated";
grant SELECT on public."timeline_aluna" to "authenticated";
grant UPDATE on public."timeline_aluna" to "authenticated";
grant DELETE on public."timeline_aluna" to "authenticated";
grant TRUNCATE on public."timeline_aluna" to "authenticated";
grant REFERENCES on public."timeline_aluna" to "authenticated";
grant TRIGGER on public."timeline_aluna" to "authenticated";
grant INSERT on public."professoras" to "authenticated";
grant SELECT on public."professoras" to "authenticated";
grant UPDATE on public."professoras" to "authenticated";
grant DELETE on public."professoras" to "authenticated";
grant INSERT on public."perfis" to "authenticated";
grant SELECT on public."perfis" to "authenticated";
grant UPDATE on public."perfis" to "authenticated";
grant DELETE on public."perfis" to "authenticated";
grant INSERT on public."modalidades" to "authenticated";
grant SELECT on public."modalidades" to "authenticated";
grant UPDATE on public."modalidades" to "authenticated";
grant DELETE on public."modalidades" to "authenticated";
grant INSERT on public."professoras_modalidades" to "authenticated";
grant SELECT on public."professoras_modalidades" to "authenticated";
grant UPDATE on public."professoras_modalidades" to "authenticated";
grant DELETE on public."professoras_modalidades" to "authenticated";
grant INSERT on public."turmas" to "authenticated";
grant SELECT on public."turmas" to "authenticated";
grant UPDATE on public."turmas" to "authenticated";
grant DELETE on public."turmas" to "authenticated";
grant INSERT on public."historico_turmas_professoras" to "authenticated";
grant SELECT on public."historico_turmas_professoras" to "authenticated";
grant UPDATE on public."historico_turmas_professoras" to "authenticated";
grant DELETE on public."historico_turmas_professoras" to "authenticated";
grant INSERT on public."alunas" to "authenticated";
grant SELECT on public."alunas" to "authenticated";
grant UPDATE on public."alunas" to "authenticated";
grant DELETE on public."alunas" to "authenticated";
grant INSERT on public."matriculas_turmas" to "authenticated";
grant SELECT on public."matriculas_turmas" to "authenticated";
grant UPDATE on public."matriculas_turmas" to "authenticated";
grant DELETE on public."matriculas_turmas" to "authenticated";
grant INSERT on public."planos" to "authenticated";
grant SELECT on public."planos" to "authenticated";
grant UPDATE on public."planos" to "authenticated";
grant DELETE on public."planos" to "authenticated";
grant INSERT on public."matriculas_planos" to "authenticated";
grant SELECT on public."matriculas_planos" to "authenticated";
grant UPDATE on public."matriculas_planos" to "authenticated";
grant DELETE on public."matriculas_planos" to "authenticated";
grant INSERT on public."aulas" to "authenticated";
grant SELECT on public."aulas" to "authenticated";
grant UPDATE on public."aulas" to "authenticated";
grant DELETE on public."aulas" to "authenticated";
grant INSERT on public."eventos" to "authenticated";
grant SELECT on public."eventos" to "authenticated";
grant UPDATE on public."eventos" to "authenticated";
grant DELETE on public."eventos" to "authenticated";
grant INSERT on public."datas_comemorativas" to "authenticated";
grant SELECT on public."datas_comemorativas" to "authenticated";
grant UPDATE on public."datas_comemorativas" to "authenticated";
grant DELETE on public."datas_comemorativas" to "authenticated";
grant INSERT on public."lista_espera" to "authenticated";
grant SELECT on public."lista_espera" to "authenticated";
grant UPDATE on public."lista_espera" to "authenticated";
grant DELETE on public."lista_espera" to "authenticated";
grant INSERT on public."feriados" to "authenticated";
grant SELECT on public."feriados" to "authenticated";
grant UPDATE on public."feriados" to "authenticated";
grant DELETE on public."feriados" to "authenticated";
grant INSERT on public."auditoria" to "authenticated";
grant SELECT on public."auditoria" to "authenticated";
grant UPDATE on public."auditoria" to "authenticated";
grant DELETE on public."auditoria" to "authenticated";