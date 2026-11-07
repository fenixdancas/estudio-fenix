-- Prevent duplicate variable-amount partner receipts for the same month.
create unique index if not exists financeiro_outros_recebimentos_competencia_uidx
  on public.financeiro ((dados_fenix->>'recorrenciaId'), (dados_fenix->>'competencia'))
  where tipo = 'entrada'
    and dados_fenix->>'outroRecebimento' = 'true'
    and dados_fenix->>'recorrenciaId' in ('parceiro:wellhub', 'parceiro:total-pass')
    and nullif(dados_fenix->>'competencia', '') is not null;
