import test from 'node:test';import assert from 'node:assert/strict';import {app} from './harness.mjs';
const cacheKey='fenix_gestao_v2:admin-test';
test('Recovery cache omits synced photos and history but retains complete unsaved rows and id links',async()=>{
 const t=app();try{
 t.client.tables.alunas[0].foto_url='data:image/png;base64,'+'A'.repeat(200000);
 await t.a.loadSupabaseDb();
 let cached=JSON.parse(t.w.localStorage.getItem(cacheKey));assert.equal(cached.schemaVersion,2);assert.equal(cached.pending,false);assert.equal(cached.db.students.length,0);assert(JSON.stringify(cached).length<10000);
 t.a.db.students[0].obs='Observação ainda não salva';t.w.eval('saveLocalOnly()');cached=JSON.parse(t.w.localStorage.getItem(cacheKey));assert.equal(cached.pending,true);assert.equal(cached.db.students.length,1);assert.equal(cached.db.students[0].foto,t.a.db.students[0].foto);assert.equal(cached.db.students[0].obs,'Observação ainda não salva');assert(Object.keys(cached.remoteIds).length>0);
 await t.a.save();cached=JSON.parse(t.w.localStorage.getItem(cacheKey));assert.equal(cached.pending,false);assert.equal(cached.db.students.length,0);assert.equal(t.client.tables.alunas[0].dados_fenix.obs,'Observação ainda não salva');
 }finally{t.close();}
});
test('Quota used by synced photos no longer prevents saving the recovery cache',async()=>{
 const t=app();try{
 t.client.tables.alunas[0].foto_url='data:image/png;base64,'+'A'.repeat(200000);
 const original=t.w.Storage.prototype.setItem;t.w.Storage.prototype.setItem=function(k,v){if(String(v).length>10000)throw new t.w.DOMException('Full','QuotaExceededError');return original.call(this,k,v);};
 await t.a.loadSupabaseDb();assert.equal(JSON.parse(t.w.localStorage.getItem(cacheKey)).pending,false);assert.doesNotMatch(t.w.document.getElementById('saveStatus').textContent,/Exporte/);
 }finally{t.close();}
});
test('Full storage preserves older pending recovery data rather than overwriting or aborting it',async()=>{
 const t=app();try{
 await t.a.loadSupabaseDb();const older={db:{students:[{id:77,nome:'Rascunho anterior'}]},pending:true,remoteIds:{}};t.w.localStorage.setItem(cacheKey,JSON.stringify(older));t.w.previousRecovery=older;
 const original=t.w.Storage.prototype.setItem;t.w.Storage.prototype.setItem=function(k,v){if(String(k).includes(':pending:'))throw new t.w.DOMException('Full','QuotaExceededError');return original.call(this,k,v);};
 assert.equal(t.w.eval('preservePendingRecovery(window.previousRecovery)'),false);assert.equal(t.w.eval('saveLocalOnly()'),false);assert.deepEqual(JSON.parse(t.w.localStorage.getItem(cacheKey)),older);
 let exported;t.w.downloadJson=(value)=>{exported=value};t.w.eval('exportPending()');assert.equal(exported.db.students[0].nome,'Rascunho anterior');
 }finally{t.close();}
});
test('Denied local storage distinguishes synced data from unsaved changes',async()=>{
 const t=app();try{
 await t.a.loadSupabaseDb();t.w.Storage.prototype.setItem=function(){throw new t.w.DOMException('Denied','SecurityError')};
 assert.equal(t.w.eval('saveLocalOnly()'),false);assert.match(t.w.document.getElementById('saveStatus').textContent,/continuam no banco/);
 t.a.db.students[0].obs='Pendente';assert.equal(t.w.eval('saveLocalOnly()'),false);assert.match(t.w.document.getElementById('saveStatus').textContent,/Exporte/);assert.equal(t.a.pending,true);
 }finally{t.close();}
});
