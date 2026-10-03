import test from 'node:test';
import assert from 'node:assert/strict';
import {app,fakeClient} from './harness.mjs';
const message={event_key:'message:test',kind:'message',phone:'5511999999999',occurred_at:'2026-10-03T12:00:00Z',content:'<img src=x onerror=alert(1)>',message_type:'text'};
function inbox(t){t.w.document.getElementById('page').innerHTML=t.a.V.whatsapp();}
test('Inbox matches contact and escapes incoming HTML without saving private messages locally',async()=>{
 const c=fakeClient();c.tables.whatsapp_eventos=[message];const t=app(c);
 try{await t.a.loadSupabaseDb();t.a.db.students[0].fone='(11) 99999-9999';inbox(t);await t.w.eval('carregarRespostasWhatsApp()');const out=t.w.document.getElementById('whatsappInbox');assert.match(out.textContent,/Aluna A/);assert.match(out.textContent,/<img/);assert.equal(out.querySelector('img'),null);assert.match(out.textContent,/09:00/);assert.equal(JSON.stringify(t.a.db).includes(message.content),false);assert.equal(c.calls.filter(x=>x.table==='whatsapp_eventos'&&x.type!=='select').length,0);}finally{t.close();}
});
test('Teachers cannot open or query the inbox',async()=>{
 const t=app();try{t.a.session={tipo:'teacher',id:'teacher'};assert.equal(t.a.V.whatsapp(),'');await assert.rejects(t.w.eval('carregarRespostasWhatsApp()'),/administrativo/);t.w.eval('go("whatsapp")');assert.equal(t.client.calls.filter(x=>x.table==='whatsapp_eventos').length,0);}finally{t.close();}
});
test('A failed query shows retry rather than claiming there are no messages',async()=>{
 const t=app();try{inbox(t);t.client.fail({table:'whatsapp_eventos',message:'offline'});await t.w.eval('carregarRespostasWhatsApp()');assert.match(t.w.document.getElementById('whatsappInbox').textContent,/Não foi possível/);}finally{t.close();}
});
test('Pending inbox cannot reveal messages after changing accounts',async()=>{
 const t=app();try{inbox(t);let release;t.a.client={from(){return {select(){return this},eq(){return this},order(){return this},limit(){return new Promise(resolve=>{release=resolve})}}}};const task=t.w.eval('carregarRespostasWhatsApp()');t.a.session={tipo:'teacher',id:'other'};release({data:[message],error:null});await task;assert.equal(t.w.document.getElementById('whatsappInbox').textContent.includes(message.content),false);}finally{t.close();}
});
