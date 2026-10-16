-- Recebimento exclusivo do fixo Cloud API. Nenhuma alteração em cadastros existentes.
begin;
create table public.whatsapp_eventos (
 event_key text primary key,
 message_id text not null,
 kind text not null check(kind in ('message','status')),
 phone text,
 occurred_at timestamptz not null,
 content text,
 message_type text,
 delivery_status text check(delivery_status in ('sent','delivered','read','failed')),
 received_at timestamptz not null default now()
);
create index whatsapp_eventos_recebidos on public.whatsapp_eventos(received_at desc);
alter table public.whatsapp_eventos enable row level security;
revoke all on public.whatsapp_eventos from anon, authenticated;
grant select on public.whatsapp_eventos to authenticated;
grant select,insert on public.whatsapp_eventos to service_role;
create policy whatsapp_eventos_admin on public.whatsapp_eventos for select to authenticated
 using (exists(select 1 from public.perfis p where p.id=auth.uid() and p.status='ativo' and p.papel='admin'));
commit;
