begin;
-- Unquoted replies are safe only when exactly one recent request matches.
create or replace function public.fenix_aplicar_resposta_experimental(p_event_key text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.whatsapp_eventos%rowtype; candidate record; candidates integer; answer text; result text;
begin
 select * into e from public.whatsapp_eventos where event_key=p_event_key;
 if not found or e.kind<>'message' or e.phone is null then return; end if;
 answer:=lower(trim(translate(coalesce(e.content,''),'áàâãéêíóôõúç','aaaaeeiooouc')));
 answer:=regexp_replace(answer,'[.!]+$','','g');
 if answer in ('sim','confirmo','confirmo minha presenca','confirmado','confirmada','sim confirmo','teste confirmado') then result:='Confirmou';
 elsif answer in ('reagendar','quero reagendar','preciso reagendar','solicitar reagendamento') then result:='Reagendou';
 else return; end if;
 select count(*) into candidates from public.comunicacoes c join public.aulas_experimentais a on a.id::text=c.resposta->>'experimental_id'
 where c.canal='whatsapp' and c.tipo='aula_experimental'
 and (e.reply_to_message_id is null or c.identificador_externo=e.reply_to_message_id)
 and c.identificador_externo is not null
 and regexp_replace(c.contato,'\D','','g')=e.phone and a.status in ('Agendada','Confirmada')
 and (a.data+a.horario)>=(e.occurred_at at time zone 'America/Sao_Paulo')
 and c.enviado_em<=e.occurred_at and e.occurred_at<=c.enviado_em+interval '48 hours';
 if candidates<>1 then return; end if;
 select a.id into candidate from public.comunicacoes c join public.aulas_experimentais a on a.id::text=c.resposta->>'experimental_id'
 where c.canal='whatsapp' and c.tipo='aula_experimental'
 and (e.reply_to_message_id is null or c.identificador_externo=e.reply_to_message_id)
 and c.identificador_externo is not null
 and regexp_replace(c.contato,'\D','','g')=e.phone and a.status in ('Agendada','Confirmada')
 and (a.data+a.horario)>=(e.occurred_at at time zone 'America/Sao_Paulo')
 and c.enviado_em<=e.occurred_at and e.occurred_at<=c.enviado_em+interval '48 hours';
 update public.aulas_experimentais set status=case when result='Confirmou' then 'Confirmada' else 'Agendada' end,
 dados_fenix=coalesce(dados_fenix,'{}'::jsonb)||jsonb_build_object('confirmacao',result,'confirmacao_evento',e.event_key,'confirmacao_em',e.occurred_at)
 where id=candidate.id and status in ('Agendada','Confirmada') and coalesce(dados_fenix->>'confirmacao_em','1970-01-01')::timestamptz<e.occurred_at;
end; $$;
revoke all on function public.fenix_aplicar_resposta_experimental(text) from public,anon,authenticated;
create or replace function public.fenix_resposta_experimental_whatsapp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.fenix_aplicar_resposta_experimental(new.event_key); return new; end; $$;
revoke all on function public.fenix_resposta_experimental_whatsapp() from public,anon,authenticated;
commit;
