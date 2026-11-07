import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {app} from './harness.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

async function setup(){const t=app();await t.a.loadSupabaseDb();return t;}
async function register(t,amount,origin,month){
 t.w.eval(`novoOutroRecebimento(null,'${origin}','${month}')`);
 const form=t.w.document.getElementById('otherReceiptForm');
 form.elements.valor.value=String(amount);form.elements.origem.value=origin;
 form.elements.competencia.value=month;form.elements.data.value=month+'-22';
 await form.onsubmit({preventDefault(){},currentTarget:form});
}

test('Wellhub and Total Pass repeat monthly while each actual variable amount is entered separately',async()=>{
 const t=await setup();try{
  t.w.eval("selecionarMesOutrosRecebimentos('2026-10')");
  let panel=t.w.eval('outrosRecebimentosPanel()');
  assert.equal((panel.match(/Aguardando valor/g)||[]).length,2);
  assert.match(panel,/Valor variável/);
  await register(t,237.45,'Wellhub','2026-10');
  panel=t.w.eval('outrosRecebimentosPanel()');
  assert.match(panel,/237,45/);assert.match(panel,/Registrado/);
  t.w.eval("selecionarMesOutrosRecebimentos('2026-11')");
  panel=t.w.eval('outrosRecebimentosPanel()');
  assert.equal((panel.match(/Aguardando valor/g)||[]).length,2);
  await register(t,315.80,'Wellhub','2026-11');
  assert.equal(t.client.tables.financeiro.length,2);
  t.w.eval("selecionarMesOutrosRecebimentos('2026-10')");
  await register(t,111,'Wellhub','2026-10');
  assert.equal(t.client.tables.financeiro.length,2);
  assert.match(t.alerts.at(-1),/já foi registrado/);
 }finally{t.close();}
});

test('Database index allows changing monthly amounts and prevents only duplicate source/month entries',async()=>{
 const db=new PGlite();try{
  await db.exec(read('./schema-export.sql'));
  await db.exec(read('../supabase/migrations/202609230001_fenix_persistencia.sql'));
  await db.exec(read('../supabase/migrations/20261107150000_outros_recebimentos_mensais.sql'));
  const add=(origin,month,amount)=>db.query("insert into financeiro(tipo,descricao,valor,status,dados_fenix) values('entrada',$1,$2,'pago',$3)",[origin,amount,JSON.stringify({outroRecebimento:true,origem:origin,recorrenciaId:'parceiro:'+origin.toLocaleLowerCase('pt-BR').replace(/\s+/g,'-'),competencia:month})]);
  await add('Wellhub','2026-10',237.45);
  await add('Wellhub','2026-11',315.80);
  await add('Total Pass','2026-10',419.13);
  await assert.rejects(add('Wellhub','2026-10',500),/unique/i);
  assert.equal((await db.query("select count(*)::int n from financeiro where tipo='entrada'")).rows[0].n,3);
 }finally{await db.close();}
});
