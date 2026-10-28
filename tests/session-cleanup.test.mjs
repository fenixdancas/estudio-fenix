import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './harness.mjs';

async function setup(){const t=app();t.a.initSupabase();await t.a.loadSupabaseDb();await t.a.start();return t;}
function assertLocked(t){
 assert.equal(t.a.session,null);
 assert.equal(t.a.db.students.length,0);
 assert.equal(Object.keys(t.a.ids).length,0);
 assert.equal(t.w.document.getElementById('page').textContent,'');
 assert.equal(t.w.document.getElementById('modalbox').textContent,'');
 assert.equal(t.w.document.getElementById('loggedName').textContent,'');
 assert.equal(t.w.document.getElementById('avatar').textContent,'');
 assert.equal(t.w.document.getElementById('app').style.display,'none');
 assert.equal(t.w.document.getElementById('loginScreen').style.display,'grid');
 assert.equal(t.w.sessionStorage.getItem('fenix_session'),null);
}
test('Service sign-out removes the loaded workspace and open student form',async()=>{
 const t=await setup();
 try{
  t.a.novaMatricula(t.a.db.students[0].id);
  assert.notEqual(t.w.document.getElementById('modalbox').textContent,'');
  t.w.sessionStorage.setItem('fenix_session','synthetic-admin');
  t.client.auth.emitAuth('SIGNED_OUT',null);
  assertLocked(t);
 }finally{t.close();}
});
test('Service sign-out preserves pending recovery without keeping the workspace open',async()=>{
 const t=await setup();
 try{
  t.a.db.students[0].nome='RASCUNHO_SINTETICO';
  t.client.auth.emitAuth('SIGNED_OUT',null);
  assertLocked(t);
  const copies=Array.from({length:t.w.localStorage.length},(_,i)=>t.w.localStorage.getItem(t.w.localStorage.key(i)));
  assert(copies.some(s=>s.includes('RASCUNHO_SINTETICO')&&JSON.parse(s).pending));
 }finally{t.close();}
});
test('A table request finishing after sign-out cannot restore old rows',async()=>{
 const t=await setup();let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const from=t.client.from.bind(t.client);
 t.client.from=table=>{const q=from(table);if(table==='alunas'){const then=q.then.bind(q);q.then=(resolve,reject)=>gate.then(()=>then(resolve,reject));}return q;};
 try{
  const loading=t.a.loadSupabaseDb();
  t.client.auth.emitAuth('SIGNED_OUT',null);
  release();
  await assert.rejects(loading,/sessão terminou/);
  assertLocked(t);
 }finally{release();t.close();}
});
test('Explicit logout locks immediately and reports an unconfirmed remote sign-out',async()=>{
 const t=await setup();let finish;
 t.client.auth.signOut=()=>new Promise(resolve=>{finish=resolve;});
 try{
  const leaving=t.a.logout();
  assertLocked(t);
  finish({error:{message:'Synthetic network failure'}});
  await leaving;
  assert(t.alerts.some(s=>s.includes('não foi possível confirmar')));
  assertLocked(t);
 }finally{t.close();}
});
test('Cancelling logout keeps the pending draft and authenticated workspace',async()=>{
 const t=await setup();let signOutCalls=0;
 t.client.auth.signOut=async()=>{signOutCalls++;return {};};t.w.confirm=()=>false;
 try{
  t.a.db.students[0].nome='RASCUNHO_SINTETICO';
  await t.a.logout();
  assert.equal(signOutCalls,0);
  assert.notEqual(t.a.session,null);
  assert.equal(t.a.db.students[0].nome,'RASCUNHO_SINTETICO');
  assert.notEqual(t.w.document.getElementById('app').style.display,'none');
 }finally{t.close();}
});
