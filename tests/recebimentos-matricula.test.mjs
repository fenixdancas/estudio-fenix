import test from 'node:test';
import assert from 'node:assert/strict';
import {app,ids} from './harness.mjs';
async function setup(){const t=app();await t.a.loadSupabaseDb();return t;}
async function receipt(t,amount='237.45',origin='Wellhub'){
 t.w.eval('novoOutroRecebimento()');const form=t.w.document.getElementById('otherReceiptForm');form.elements.valor.value=amount;form.elements.origem.value=origin;form.elements.data.value='2026-10-22';form.elements.forma.value='Transferência';
 await form.onsubmit({preventDefault(){},currentTarget:form});
}
test('Partner receipts accept variable amounts without a student, persist after reload and enter the monthly total',async()=>{
 const t=await setup();try{
 await receipt(t);await receipt(t,'419.13','Total Pass');
 assert.equal(t.client.tables.financeiro.length,2);assert(t.client.tables.financeiro.every(p=>p.aluna_id===null&&p.tipo==='entrada'&&p.status==='pago'));
 assert.equal(t.client.tables.financeiro[0].valor,237.45);assert.match(t.client.tables.financeiro[0].pago_em,/2026-10-22/);
 await t.a.loadSupabaseDb();assert.equal(t.a.db.payments.filter(p=>p.outroRecebimento).length,2);
 assert.match(t.a.V.financeiro(),/Wellhub/);assert.match(t.a.V.financeiro(),/Total Pass/);assert.doesNotMatch(t.a.V.mensalidades(),/419,13/);
 // An explicit edit updates the same receipt rather than duplicating it.
 t.w.eval(`novoOutroRecebimento(${t.a.db.payments[0].id})`);const f=t.w.document.getElementById('otherReceiptForm');f.elements.valor.value='250.11';await f.onsubmit({preventDefault(){}});assert.equal(t.client.tables.financeiro.length,2);assert.equal(t.client.tables.financeiro[0].valor,250.11);
 }finally{t.close();}
});
test('Rejected or invalid partner receipt does not report success or create a local payment',async()=>{
 const t=await setup();try{
 await receipt(t,'0');assert.equal(t.client.tables.financeiro.length,0);
 t.client.fail({message:'Falha de rede'});await receipt(t);assert.equal(t.a.db.payments.length,0);assert.match(t.alerts.at(-1),/Falha de rede/);assert(t.w.document.getElementById('otherReceiptForm'));
 }finally{t.close();}
});
test('Enrollment exclusion preserves financial history, closes class links atomically and is recoverable after reload',async()=>{
 const t=await setup();try{
 const id=t.a.db.students[0].id;
 t.client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000001',aluna_id:ids.student,tipo:'mensalidade',status:'pago',descricao:'2026-10',valor:255,pago_em:'2026-10-10T12:00:00-03:00'});await t.a.loadSupabaseDb();
 const before=JSON.stringify(t.client.tables.financeiro);await t.w.eval(`excluirMatricula(${id})`);
 assert.equal(t.a.visibleStudents().some(s=>s.id===id),false);assert.equal(t.client.tables.alunas[0].status,'inativo');assert.equal(JSON.stringify(t.client.tables.financeiro),before);
 const call=t.client.calls.filter(c=>c.name==='fenix_salvar_registro').at(-1);assert.deepEqual(call.p.p_vinculos,{turmas:[]});
 // The UI harness does not implement enrollment links; emulate the confirmed DB result for reload.
 t.client.tables.matriculas_turmas[0].status='encerrada';await t.a.loadSupabaseDb();assert.equal(t.a.visibleStudents().some(s=>s.id===id),false);
 await t.w.eval(`restaurarMatricula(${id})`);assert.equal(t.a.visibleStudents().some(s=>s.id===id),true);assert.equal(t.client.tables.alunas[0].status,'ativo');assert.equal(JSON.stringify(t.client.tables.financeiro),before);
 assert.deepEqual(t.client.calls.filter(c=>c.name==='fenix_salvar_registro').at(-1).p.p_vinculos,{turmas:[ids.class]});
 }finally{t.close();}
});
test('Failed or cancelled exclusion leaves enrollment visible and forbids teacher actions',async()=>{
 const t=await setup();try{
 const id=t.a.db.students[0].id;t.w.confirm=()=>false;await t.w.eval(`excluirMatricula(${id})`);assert(t.a.visibleStudents().some(s=>s.id===id));
 t.w.confirm=()=>true;t.client.fail({message:'Conflito de versão'});await t.w.eval(`excluirMatricula(${id})`);assert(t.a.visibleStudents().some(s=>s.id===id));assert.equal(t.a.db.students[0].matriculaExcluidaEm,undefined);
 t.a.session={tipo:'teacher',teacherId:ids.teacher};assert.throws(()=>t.w.eval('novoOutroRecebimento()'),/administrativo/);await assert.rejects(t.w.eval(`excluirMatricula(${id})`),/administrativo/);assert.throws(()=>t.w.eval('verMatriculasExcluidas()'),/administrativo/);
 }finally{t.close();}
});
