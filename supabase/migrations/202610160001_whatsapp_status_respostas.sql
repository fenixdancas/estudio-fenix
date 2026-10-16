-- Additive: preserve existing events, permissions and student records.
begin;
alter table public.whatsapp_eventos
 add column if not exists error_code text,
 add column if not exists error_message text,
 add column if not exists reply_to_message_id text;
create index if not exists whatsapp_eventos_message_id_idx on public.whatsapp_eventos(message_id);
create index if not exists comunicacoes_whatsapp_external_idx on public.comunicacoes(identificador_externo) where canal='whatsapp';

-- Only an explicit reply to this exact request, from its recipient, can confirm.
create or replace function public.fenix_resposta_experimental_whatsapp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 candidate record;
 candidates integer;
 answer text;
 result text;
begin
 if new.kind<>'message' or new.reply_to_message_id is null or new.phone is null then return new; end if;
 answer:=lower(trim(translate(coalesce(new.content,''),'áàâãéêíóôõúç','aaaaeeiooouc')));
 answer:=regexp_replace(answer,'[.!]+$','','g');
 if answer in ('sim','confirmo','confirmo minha presenca','confirmado','confirmada','sim confirmo') then result:='Confirmou';
 elsif answer in ('reagendar','quero reagendar','preciso reagendar','solicitar reagendamento') then result:='Reagendou';
 else return new; end if;
 select count(*) into candidates from public.comunicacoes c join public.aulas_experimentais a
 on a.id::text=c.resposta->>'experimental_id'
 where c.canal='whatsapp' and c.tipo='aula_experimental'
 and c.identificador_externo=new.reply_to_message_id
 and regexp_replace(c.contato,'\D','','g')=new.phone
 and a.status in ('Agendada','Confirmada')
 and (a.data+a.horario) >= (new.occurred_at at time zone 'America/Sao_Paulo')
 and c.enviado_em<=new.occurred_at and new.occurred_at<=c.enviado_em+interval '48 hours';
 if candidates<>1 then return new; end if;
 select a.id into candidate from public.comunicacoes c join public.aulas_experimentais a
 on a.id::text=c.resposta->>'experimental_id'
 where c.canal='whatsapp' and c.tipo='aula_experimental' and c.identificador_externo=new.reply_to_message_id
 and regexp_replace(c.contato,'\D','','g')=new.phone
 and a.status in ('Agendada','Confirmada')
 and (a.data+a.horario)>=(new.occurred_at at time zone 'America/Sao_Paulo')
 and c.enviado_em<=new.occurred_at and new.occurred_at<=c.enviado_em+interval '48 hours';
 update public.aulas_experimentais
 set status=case when result='Confirmou' then 'Confirmada' else 'Agendada' end,
 dados_fenix=coalesce(dados_fenix,'{}'::jsonb)||jsonb_build_object('confirmacao',result,'confirmacao_evento',new.event_key,'confirmacao_em',new.occurred_at)
 where id=candidate.id and status in ('Agendada','Confirmada')
 and coalesce(dados_fenix->>'confirmacao_em','1970-01-01')::timestamptz<new.occurred_at;
 return new;
end;
$$;
revoke all on function public.fenix_resposta_experimental_whatsapp() from public,anon,authenticated;
create or replace trigger fenix_resposta_experimental_whatsapp_trigger
 after insert on public.whatsapp_eventos for each row execute function public.fenix_resposta_experimental_whatsapp();
commit;
