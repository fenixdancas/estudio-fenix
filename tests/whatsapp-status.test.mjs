import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './harness.mjs';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../supabase/migrations/202610160001_whatsapp_status_respostas.sql',import.meta.url),'utf8');
test('Delivery UI distinguishes accepted, failed and delivered; late sent cannot hide read',()=>{
 const x=app();try{const rows=x.w.whatsappDeliveryRows([{kind:'status',message_id:'a',delivery_status:'read',occurred_at:'2026-10-16T10:00:00Z'},{kind:'status',message_id:'a',delivery_status:'sent',occurred_at:'2026-10-16T11:00:00Z'},{kind:'status',message_id:'b',delivery_status:'failed',error_code:'131049',error_message:'Provider refused',occurred_at:'2026-10-16T11:00:00Z'}],[{identificador_externo:'c',enviado_em:'2026-10-16T09:00:00Z',contato:'5511999999999'}]);assert.equal(rows.find(r=>r.id==='a').status,'read');assert.equal(rows.find(r=>r.id==='c').status,'accepted');assert.match(rows.find(r=>r.id==='b').reason,/131049/);x.a.session.tipo='teacher';assert.equal(x.w.whatsappStatusPanel(),'');assert.equal(x.w.normalizeWhatsAppPhone('(11) 99999-9999'),'5511999999999');}finally{x.close()}
});
test('Only exact quoted request from correct recipient updates a future experimental class',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table whatsapp_eventos(event_key text primary key,message_id text,kind text,phone text,content text,occurred_at timestamptz);create table comunicacoes(canal text,tipo text,identificador_externo text,contato text,resposta jsonb,enviado_em timestamptz);create table aulas_experimentais(id uuid primary key,status text,data date,horario time,dados_fenix jsonb);`);
 await db.exec(migration);
 const id='10000000-0000-4000-8000-000000000001';
 await db.query(`insert into aulas_experimentais values($1,'Agendada','2026-10-17','10:00','{}');`,[id]);
 await db.query(`insert into comunicacoes values('whatsapp','aula_experimental','request-1','5511999999999',$1,'2026-10-16T10:00:00Z');`,[JSON.stringify({experimental_id:id})]);
 async function incoming(key,text,phone='5511999999999',reply='request-1',at='2026-10-16T11:00:00Z'){await db.query(`insert into whatsapp_eventos(event_key,message_id,kind,phone,content,occurred_at,reply_to_message_id)values($1,$1,'message',$2,$3,$4,$5)`,[key,phone,text,at,reply]);}
 async function status(){return(await db.query('select status,dados_fenix from aulas_experimentais')).rows[0];}
 await incoming('wrong','Confirmo','5511888888888');assert.equal((await status()).status,'Agendada');
 await incoming('unquoted','Confirmo','5511999999999',null);assert.equal((await status()).status,'Agendada');
 await incoming('ambiguous','Não confirmo');assert.equal((await status()).status,'Agendada');
 await incoming('yes','Confirmo!');assert.equal((await status()).status,'Confirmada');assert.equal((await status()).dados_fenix.confirmacao,'Confirmou');
 await incoming('reschedule','Reagendar','5511999999999','request-1','2026-10-16T11:01:00Z');assert.equal((await status()).dados_fenix.confirmacao,'Reagendou');
 await incoming('old','Confirmo','5511999999999','request-1','2026-10-16T10:59:00Z');assert.equal((await status()).dados_fenix.confirmacao,'Reagendou');
 await db.exec(`update aulas_experimentais set status='Cancelada'`);await incoming('cancelled','Confirmo','5511999999999','request-1','2026-10-16T11:02:00Z');assert.equal((await status()).status,'Cancelada');
 }finally{await db.close();}
});
