import test from 'node:test';import assert from 'node:assert/strict';
import {app,fixtures,fakeClient,ids,html} from './harness.mjs';
async function setup(){const t=app();await t.a.loadSupabaseDb();return t;}
const writeRpcCalls=t=>t.client.calls.filter(c=>c.type==='rpc'&&c.name!=='fenix_listar_observacoes_compartilhadas');
test('Monthly charge is added on the same due day without rolling an open previous month',async()=>{
 const client=fakeClient();const t=app(client),today=t.a.nowISO(),month=today.slice(0,7),[year,monthNumber]=month.split('-').map(Number),prior=new Date(year,monthNumber-2,1).toISOString().slice(0,7);
 Object.assign(client.tables.alunas[0].dados_fenix,{dataMatricula:prior+'-01',diaVenc:'20'});
 const previousDue=prior+'-20';client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000001',aluna_id:ids.student,tipo:'mensalidade',status:'em_aberto',vencimento:previousDue,descricao:prior,valor:255});
 try{
  await t.a.loadSupabaseDb();await t.a.loadSupabaseDb();
  assert.equal(client.tables.financeiro.length,2);
  const old=client.tables.financeiro.find(p=>p.descricao===prior),current=client.tables.financeiro.find(p=>p.descricao===month);
  assert.equal(old.status,'em_aberto');assert.equal(old.vencimento,previousDue);assert.equal(old.valor,255);
  assert.equal(current.status,'em_aberto');assert.equal(current.vencimento,month+'-20');assert.equal(current.valor,255);
  assert.equal(t.a.db.payments.filter(p=>p.studentId===t.a.db.students[0].id&&p._tipo==='mensalidade').length,2);
 }finally{t.close();}
});
test('Monthly generation skips check-in partners and existing current competence',async()=>{
 const client=fakeClient();const t=app(client),month=t.a.nowISO().slice(0,7);
 Object.assign(client.tables.alunas[0].dados_fenix,{dataMatricula:month+'-01',diaVenc:'15'});
 Object.assign(client.tables.alunas[1].dados_fenix,{dataMatricula:month+'-01',diaVenc:'15',checkin:'Wellhub'});
 client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000002',aluna_id:ids.student,tipo:'mensalidade',status:'pago',pago_em:month+'-15T12:00:00-03:00',vencimento:month+'-15',descricao:month,valor:255});
 try{await t.a.loadSupabaseDb();assert.equal(client.tables.financeiro.length,1);assert.equal(t.a.db.payments.length,1);assert.equal(t.a.db.payments[0].pago,true);}finally{t.close();}
});
test('Trancada enrollment keeps history and stops new monthly charges',async()=>{
 const client=fakeClient(),t=app(client),month=t.a.nowISO().slice(0,7),prior='2026-09';
 client.tables.alunas[0].status='trancada';Object.assign(client.tables.alunas[0].dados_fenix,{dataMatricula:'2026-08-01',diaVenc:'20'});
 client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000003',aluna_id:ids.student,tipo:'mensalidade',status:'em_aberto',descricao:prior,valor:255,vencimento:prior+'-20'});
 try{
  await t.a.loadSupabaseDb();
  assert.equal(t.a.db.students[0].status,'trancada');
  assert.deepEqual(client.tables.financeiro.filter(p=>p.aluna_id===ids.student).map(p=>({comp:p.descricao,status:p.status,venc:p.vencimento})),[{comp:prior,status:'em_aberto',venc:prior+'-20'}]);
  t.a.view='alunos';t.a.render();assert.match(t.w.document.getElementById('studentTable').textContent,/Trancada/);
  t.a.novaMatricula(t.a.db.students[0].id);const form=t.w.document.getElementById('studentForm');
  assert.equal(form.elements.status.value,'trancada');assert([...form.elements.status.options].some(option=>option.value==='trancada'&&option.textContent==='Trancada'));
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(client.tables.alunas[0].status,'trancada');
 }finally{t.close();}
});
test('Concurrent admin logins generate one monthly charge with a stable finance ID',async()=>{
 const client=fakeClient(),t1=app(client),t2=app(client),month=t1.a.nowISO().slice(0,7);
 Object.assign(client.tables.alunas[0].dados_fenix,{diaVenc:'10'});
 try{
  await Promise.all([t1.a.loadSupabaseDb(),t2.a.loadSupabaseDb()]);
  const rows=client.tables.financeiro.filter(p=>p.tipo==='mensalidade'&&p.descricao===month);
  assert.equal(rows.length,1);assert.equal(rows[0].vencimento,month+'-10');assert.equal(rows[0].status,'em_aberto');
  assert.equal(t1.w.document.getElementById('saveStatus').textContent,'Salvo no banco');assert.equal(t2.w.document.getElementById('saveStatus').textContent,'Salvo no banco');
 }finally{t1.close();t2.close();}
});
test('Enrollment tuition follows the selected due day while fee keeps enrollment date',async()=>{
 for(const [day,date,expected] of [['10','2026-10-01','2026-10-10'],['20','2026-10-01','2026-10-20'],['30','2026-02-01','2026-02-28'],['30','2028-02-01','2028-02-29']]){
  const t=await setup();
  try{
   Object.assign(t.a.db.students[0],{diaVenc:day,dataMatricula:date,valorMatricula:'60'});
   t.w.eval('createEnrollmentReceivables(window.testAPI.db.students[0])');await t.a.save();await t.a.loadSupabaseDb();
   assert.equal(t.a.db.payments.find(p=>p._tipo==='mensalidade').venc,expected);
   assert.equal(t.a.db.payments.find(p=>p._tipo==='entrada').venc,date);
   assert(t.client.tables.financeiro.every(p=>p.pago_em===null&&p.status==='em_aberto'));
  }finally{t.close();}
 }
});
test('Monthly form updates due date for student and month and accepts an explicit exception',async()=>{
 const t=await setup();
 try{
  t.a.db.students[0].diaVenc='10';t.a.db.students[1].diaVenc='30';
  t.a.novaMensalidade();const form=t.w.document.getElementById('payForm');
  assert.equal(form.elements.venc.value,t.a.nowISO().slice(0,7)+'-10');
  form.elements.studentId.value=t.a.db.students[1].id;form.elements.studentId.onchange();
  form.elements.comp.value='2026-02';form.elements.comp.onchange();assert.equal(form.elements.venc.value,'2026-02-28');
  form.elements.venc.value='2026-02-25';await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(t.client.tables.financeiro[0].vencimento,'2026-02-25');assert.equal(t.client.tables.financeiro[0].pago_em,null);
 }finally{t.close();}
});
test('Monthly list hides unpaid zero-value Wellhub and TotalPass placeholders, preserving actual charges',async()=>{
 const t=await setup();
 try{
  const wellhub=t.a.db.students[0].id,totalpass=t.a.db.students[1].id;
  t.a.db.students.find(s=>s.id===wellhub).checkin='Wellhub';
  t.a.db.students.find(s=>s.id===totalpass).checkin='TotalPass';
  t.a.db.payments.push(
   {id:88,studentId:wellhub,aluno:'Aluna Wellhub',comp:'2026-10',valor:0,_tipo:'mensalidade',_status:'em_aberto',pago:false},
   {id:89,studentId:totalpass,aluno:'Aluno TotalPass',comp:'2026-10',valor:0,_tipo:'mensalidade',_status:'em_aberto',pago:false},
   {id:90,studentId:wellhub,aluno:'Aluna Wellhub',comp:'2026-10',valor:150,_tipo:'mensalidade',_status:'pago',pago:true}
  );
  t.a.view='mensalidades';t.a.render();const html=t.w.document.getElementById('page').textContent;
  assert.doesNotMatch(html,/Aluna Wellhub.*2026-10.*R\$\s*0,00/s);
  assert.doesNotMatch(html,/Aluno TotalPass.*2026-10.*R\$\s*0,00/s);
  assert.match(html,/Aluna Wellhub/);assert.match(html,/R\$\s*150,00/);
 }finally{t.close();}
});
test('Monthly list hides Wellhub and Totalpass partner entries at any value or status',async()=>{
 const t=await setup();
 try{
  t.a.db.students.push({id:9901,nome:'Wellhub',checkin:'Nenhum'},{id:9902,nome:'Totalpass',checkin:'Nenhum'});
  t.a.db.payments.push(
   {id:9911,studentId:9901,aluno:'Wellhub',comp:'2026-10',valor:150,_tipo:'mensalidade',_status:'em_aberto',pago:false},
   {id:9912,studentId:9902,aluno:'Totalpass',comp:'2026-10',valor:150,_tipo:'mensalidade',_status:'pago',pago:true}
  );
  t.a.view='mensalidades';t.a.render();const page=t.w.document.getElementById('page').textContent;
  assert.doesNotMatch(page,/Wellhub|Totalpass/);
 }finally{t.close();}
});
test('Monthly payment tabs show one month at a time and keep an all-months view',async()=>{
 const t=await setup();
 try{
  const current=t.a.nowISO().slice(0,7), priorDate=new Date(current+'-01T12:00:00-03:00');
  priorDate.setMonth(priorDate.getMonth()-1);
  const prior=priorDate.getFullYear()+'-'+String(priorDate.getMonth()+1).padStart(2,'0');
  t.a.db.payments.push(
   {id:7601,studentId:t.a.db.students[0].id,aluno:'Cobrança atual',comp:current,valor:255,_tipo:'mensalidade',_status:'em_aberto',pago:false,venc:current+'-10'},
   {id:7602,studentId:t.a.db.students[0].id,aluno:'Cobrança anterior',comp:prior,valor:255,_tipo:'mensalidade',_status:'pago',pago:true,venc:prior+'-10'}
  );
  t.a.view='mensalidades';t.a.render();
  let page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Cobrança atual/);assert.doesNotMatch(page,/Cobrança anterior/);
  assert.match(t.w.document.getElementById('page').innerHTML,/role="tablist"/);
  t.w.eval("selecionarMesMensalidade('"+prior+"')");
  page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Cobrança anterior/);assert.doesNotMatch(page,/Cobrança atual/);
  t.w.eval("selecionarMesMensalidade('todos')");
  page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Cobrança anterior/);assert.match(page,/Cobrança atual/);
 }finally{t.close();}
});
test('Accounts payable month tabs reduce rows and preserve the all-months history',async()=>{
 const t=await setup();
 try{
  const current=t.a.nowISO().slice(0,7), priorDate=new Date(current+'-01T12:00:00-03:00');priorDate.setMonth(priorDate.getMonth()-1);
  const prior=priorDate.getFullYear()+'-'+String(priorDate.getMonth()+1).padStart(2,'0');
  t.a.db.expenses.push(
   {id:7701,nome:'Conta atual',cat:'Serviço',valor:100,venc:current+'-10',comp:current,tipoDespesa:'permanente',_status:'em_aberto',pago:false},
   {id:7702,nome:'Conta anterior',cat:'Serviço',valor:100,venc:prior+'-10',comp:prior,tipoDespesa:'permanente',_status:'pago',pago:true}
  );
  t.a.view='contas';t.a.render();let page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Conta atual/);assert.doesNotMatch(page,/Conta anterior/);
  t.w.eval("selecionarMesContas('"+prior+"')");page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Conta anterior/);assert.doesNotMatch(page,/Conta atual/);
  t.w.eval("selecionarMesContas('todos')");page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Conta anterior/);assert.match(page,/Conta atual/);
 }finally{t.close();}
});
test('Experimental classes separate upcoming appointments from history',async()=>{
 const t=await setup(),today=t.a.nowISO(),pastDate=new Date(today+'T12:00:00'),futureDate=new Date(today+'T12:00:00');
 pastDate.setDate(pastDate.getDate()-1);futureDate.setDate(futureDate.getDate()+3);
 const past=pastDate.toISOString().slice(0,10),future=futureDate.toISOString().slice(0,10);
 try{
  t.a.db.experimental.push(
   {id:7801,nome:'Experimental próxima',fone:'11900000001',modalidade:'Ballet',data:future,hora:'10:00',profId:t.a.db.teachers[0].id,status:'Confirmada'},
   {id:7802,nome:'Experimental antiga',fone:'11900000002',modalidade:'Jazz',data:past,hora:'11:00',profId:t.a.db.teachers[0].id,status:'Realizada'}
  );
  t.a.view='experimentais';t.a.render();let page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Experimental próxima/);assert.doesNotMatch(page,/Experimental antiga/);
  t.w.eval("selecionarAbaExperimental('historico')");page=t.w.document.getElementById('page').textContent;
  assert.match(page,/Experimental antiga/);assert.doesNotMatch(page,/Experimental próxima/);
 }finally{t.close();}
});
test('Attendance filters by class and month without losing history',async()=>{
 const t=await setup(),current=t.a.nowISO().slice(0,7),priorDate=new Date(current+'-01T12:00:00-03:00');
 priorDate.setMonth(priorDate.getMonth()-1);const prior=priorDate.getFullYear()+'-'+String(priorDate.getMonth()+1).padStart(2,'0');
 try{
  t.a.db.attendance.push(
   {id:7901,data:current+'-10',turmaId:t.a.db.classes[0].id,profId:t.a.db.teachers[0].id,pres:[true],studentIds:[t.a.db.students[0].id]},
   {id:7902,data:prior+'-10',turmaId:t.a.db.classes[1].id,profId:t.a.db.teachers[1].id,pres:[false],studentIds:[t.a.db.students[1].id]}
  );
  t.a.view='presenca';t.a.render();let page=[...t.w.document.querySelectorAll('#page table tr')].map(row=>row.textContent).join(' ');
  assert.match(page,/10\/.*2026/);assert.match(page,/Ballet A/);assert.doesNotMatch(page,/Ballet B/);
  t.w.eval("selecionarMesPresenca('todos')");t.w.eval("selecionarTurmaPresenca('"+t.a.db.classes[1].id+"')");
  page=[...t.w.document.querySelectorAll('#page table tr')].map(row=>row.textContent).join(' ');assert.match(page,/Ballet B/);assert.doesNotMatch(page,/Ballet A/);
  assert.match(t.w.document.getElementById('page').innerHTML,/Filtrar presença por turma/);assert.match(t.w.document.getElementById('page').innerHTML,/Filtrar presença por mês/);
 }finally{t.close();}
});
test('Payment date stays separate from due date through receipt, edits and reload',async()=>{
 const t=app();
 t.client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000001',aluna_id:ids.student,tipo:'mensalidade',descricao:'2026-10',valor:255,status:'em_aberto',vencimento:'2026-10-01',pago_em:null});
 try{
  await t.a.loadSupabaseDb();t.a.db.students[0].diaVenc='20';const id=t.a.db.payments[0].id;
  t.w.eval(`editarDatasMensalidade(${id})`);let form=t.w.document.getElementById('paymentDatesForm');
  assert.equal(form.elements.data,undefined);t.w.document.getElementById('useEnrollmentDue').click();
  await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(t.client.tables.financeiro[0].vencimento,'2026-10-20');assert.equal(t.client.tables.financeiro[0].pago_em,null);
  t.w.eval(`receber(${id})`);form=t.w.document.getElementById('receiveForm');form.elements.data.value='2026-10-05';
  await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(t.client.tables.financeiro[0].pago_em,'2026-10-05T12:00:00-03:00');assert.equal(t.client.tables.financeiro[0].vencimento,'2026-10-20');
  t.w.eval(`editarDatasMensalidade(${id})`);form=t.w.document.getElementById('paymentDatesForm');form.elements.venc.value='2026-10-10';
  await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(t.client.tables.financeiro[0].pago_em,'2026-10-05T12:00:00-03:00');
  t.w.eval(`editarDatasMensalidade(${id})`);form=t.w.document.getElementById('paymentDatesForm');form.elements.data.value='2026-10-06';
  await form.onsubmit({preventDefault(){},currentTarget:form});await t.a.loadSupabaseDb();
  assert.equal(t.a.db.payments[0].venc,'2026-10-10');assert.equal(t.a.db.payments[0].data,'2026-10-06');assert.equal(t.a.db.payments[0].pago,true);
  t.a.view='mensalidades';t.a.render();assert.match(t.w.document.getElementById('page').textContent,/Data do pagamento/);
  t.a.session={tipo:'teacher',teacherId:ids.teacher};assert.throws(()=>t.w.eval(`editarDatasMensalidade(${id})`),/administrativo/);
 }finally{t.close();}
});
test('Consecutive new records keep both saved entries instead of replacing the first',async()=>{
 for(const [method,formId,collection,table] of [['novaConta','expenseForm','expenses','financeiro'],['novoEvento','eventForm','events','eventos'],['novaComemorativa','commForm','commemorative','datas_comemorativas'],['novaMensalidade','payForm','payments','financeiro']]){
  const t=await setup();
  try{
   for(let i=0;i<2;i++){
    t.a[method]();const form=t.w.document.getElementById(formId);
    if(form.elements.nome)form.elements.nome.value='Registro '+i;
    if(form.elements.data)form.elements.data.value='2026-10-10';
    if(form.elements.valor)form.elements.valor.value=String(150+i);
    if(form.elements.venc)form.elements.venc.value='2026-10-10';
    if(form.elements.comp)form.elements.comp.value=i?'2026-11':'2026-10';
    await form.onsubmit({preventDefault(){},currentTarget:form});
   }
   assert.equal(t.a.db[collection].length,2,method);
   assert.equal(t.client.tables[table].length,2,method);
   await t.a.loadSupabaseDb();assert.equal(t.a.db[collection].length,2,method+' reload');
  }finally{t.close();}
 }
});
test('Permanent expenses are editable and create one new account per month; variable expenses do not repeat',async()=>{
 const t=await setup();const today=t.a.nowISO(),month=today.slice(0,7),[year,monthNumber]=month.split('-').map(Number),prior=new Date(year,monthNumber-2,1).toISOString().slice(0,7);
 try{
  t.a.novaConta();let form=t.w.document.getElementById('expenseForm');form.elements.nome.value='Aluguel';form.elements.tipoDespesa.value='permanente';form.elements.cat.value='Espaço';form.elements.valor.value='1200';form.elements.venc.value=prior+'-10';
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db.expenses.length,1);
  const id=t.a.db.expenses[0].id;t.a.novaConta(id);form=t.w.document.getElementById('expenseForm');form.elements.nome.value='Aluguel reajustado';form.elements.valor.value='1250';
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db.expenses.length,1);assert.equal(t.a.db.expenses[0].id,id);
  assert.equal(t.client.tables.financeiro[0].descricao,'Aluguel reajustado');assert.equal(t.client.tables.financeiro[0].dados_fenix.valor,1250);
  await t.a.loadSupabaseDb();assert.equal(t.a.db.expenses.length,2);
  const next=t.a.db.expenses.find(e=>e.comp===month);assert.equal(next.nome,'Aluguel reajustado');assert.equal(next.valor,1250);assert.equal(next.tipoDespesa,'permanente');
  await t.a.loadSupabaseDb();assert.equal(t.a.db.expenses.length,2);
  t.a.novaConta(next.id);form=t.w.document.getElementById('expenseForm');form.elements.tipoDespesa.value='variavel';await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(await t.w.eval('gerarLancamentosRecorrentesDoMes()'),0);
  t.a.novaConta();form=t.w.document.getElementById('expenseForm');form.elements.nome.value='Material de aula';form.elements.tipoDespesa.value='variavel';form.elements.valor.value='80';form.elements.venc.value=month+'-12';
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db.expenses.length,3);assert.equal(await t.w.eval('gerarLancamentosRecorrentesDoMes()'),0);
  t.a.view='contas';t.a.render();const page=t.w.document.getElementById('page').textContent;assert.match(page,/Permanentes/);assert.match(page,/Variáveis/);assert.match(page,/Aluguel reajustado/);assert.match(page,/Material de aula/);
 }finally{t.close();}
});
test('Cancelled finance stays in history without pending totals or payment actions',async()=>{
 const t=app();
 for(const [i,tipo,status] of [[1,'mensalidade','cancelado'],[2,'mensalidade','negociado'],[3,'saida','cancelado'],[4,'saida','negociado']])
  t.client.tables.financeiro.push({id:`50000000-0000-4000-8000-00000000000${i}`,aluna_id:tipo==='saida'?null:ids.student,tipo,descricao:'Registro '+i,valor:150,status,vencimento:'2026-10-10'});
 try{
  await t.a.loadSupabaseDb();t.a.view='mensalidades';t.a.render();
  assert.doesNotMatch(t.w.document.getElementById('page').textContent,/Registro 1|Cancelado/);
  assert.equal(t.a.db.payments.find(p=>p.comp==='Registro 1')._status,'cancelado');
  assert.match(t.w.document.getElementById('page').textContent,/Negociado/);
  assert.equal(t.w.document.querySelectorAll('#page button[onclick^="receber"]').length,1);
  t.w.eval(`receber(${t.a.db.payments[0].id})`);assert.equal(t.w.document.getElementById('receiveForm'),null);
  t.a.view='contas';t.a.render();assert.match(t.w.document.getElementById('page').textContent,/Cancelada/);
  assert.equal(t.w.document.querySelectorAll('#page button[onclick^="pagarConta"]').length,1);
  await t.w.eval(`pagarConta(${t.a.db.expenses[0].id})`);assert.equal(t.client.tables.financeiro[2].status,'cancelado');
  t.a.view='painel';t.a.render();
  assert.equal(t.a.db.payments.filter(t.w.financePending).length,1);
  assert.equal(t.a.db.expenses.filter(t.w.financePending).length,1);
  assert.doesNotMatch(t.w.document.getElementById('page').textContent,/Mensalidades pendentes|Próximas contas|R\$/);
 }finally{t.close();}
});
test('Enrollment without a defined tuition never invents a zero-value receivable',async()=>{
 for(const amount of [null,undefined,'','VIP']){
  const t=await setup();
  try{
   const student=t.a.db.students[0];student.dataMatricula='2026-10-01';student.mensalidade=amount;student.valorMatricula='60';
   t.w.eval(`createEnrollmentReceivables(window.testAPI.db.students[0])`);await t.a.save();
   assert.deepEqual(t.client.tables.financeiro.map(r=>r.valor),[60]);
  }finally{t.close();}
 }
});
test('Monthly student picker sorts names and follows the selected VIP plan',async()=>{
 const t=await setup();
 try{
  t.a.db.students[0].nome='Zoé';t.a.db.students[1].nome='Álvaro';t.a.db.students[1].mensalidade='VIP';
  t.a.novaMensalidade();const form=t.w.document.getElementById('payForm');
  assert.deepEqual([...form.elements.studentId.options].map(o=>o.textContent),['Álvaro','Zoé']);
  assert.equal(form.elements.tipoMensalidade.value,'VIP');assert.equal(form.elements.valor.value,'');
  form.elements.studentId.value=t.a.db.students[0].id;form.elements.studentId.onchange();
  assert.equal(form.elements.tipoMensalidade.value,'Regular');assert.equal(form.elements.valor.value,'255');
 }finally{t.close();}
});
test('Trancada enrollment does not appear on new attendance lists',async()=>{
 const t=await setup();try{
  t.a.db.students[0].status='trancada';t.w.eval('novaPresenca()');
  const text=t.w.document.getElementById('attList').textContent;
  assert.doesNotMatch(text,/Aluna A/);assert.match(text,/Nenhuma aluna vinculada/);
 }finally{t.close();}
});
test('IDs loaded from Supabase round-trip without insertion',async()=>{const t=await setup();const s=t.a.db.students[0];assert.equal(t.a.remoteForLocal('alunas',s.id),ids.student);s.obs='Atualizada';await t.a.save();assert.equal(t.client.tables.alunas.length,2);assert.equal(writeRpcCalls(t).length,1);t.close();});
test('Save and reload preserves health, monthly amount and observations',async()=>{const t=await setup();const s=t.a.db.students[0];s.saudeObs='Nova observação';s.mensalidade=500;s.emergNome='Contato sintético';await t.a.save();await t.a.loadSupabaseDb();assert.equal(t.a.db.students[0].mensalidade,500);assert.equal(t.a.db.students[0].saudeObs,'Nova observação');assert.equal(t.a.db.students[0].emergNome,'Contato sintético');assert.equal(t.a.db.students[0].alergias,'Sim');t.close();});
test('Teacher health summary hides unknown-only selections and lists declared conditions',()=>{
 const t=app();
 try{
  const unknown={fisicas:['Desconheço'],respiratorias:['Desconheço'],autoimunes:['Desconheço'],psicologicas:['Desconheço'],tabagismo:'Não',alergias:'Não',cirurgias:'Não',fobias:'Não'};
  const empty=t.w.eval(`saudeHtmlAluna_(${JSON.stringify(unknown)})`);
  assert.match(empty,/Nada declarado pela aluna/);assert.doesNotMatch(empty,/Desconheço/);
  const declared={...unknown,fisicas:['Bursite','Desconheço'],psicologicas:['Depressão']};
  const summary=t.w.eval(`saudeHtmlAluna_(${JSON.stringify(declared)})`);
  assert.match(summary,/Bursite, Depressão/);assert.doesNotMatch(summary,/Desconheço/);
 }finally{t.close();}
});
test('No hardcoded tuition when source has no amount',async()=>{const t=app();delete t.client.tables.alunas[0].dados_fenix.mensalidade;await t.a.loadSupabaseDb();assert.equal(t.a.db.students[0].mensalidade,null);t.close();});
test('New enrollment created as trancada does not create initial charges',async()=>{
 const t=await setup();try{
  t.a.novaMatricula();const form=t.w.document.getElementById('studentForm');
  form.elements.status.value='trancada';form.elements.nome.value='Aluna pausada';form.querySelector('input[name="modalidades"]').checked=true;form.querySelector('input[name="turmaIds"]').checked=true;
  await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(t.client.tables.alunas.at(-1).status,'trancada');assert.equal(t.client.tables.financeiro.length,0);
 }finally{t.close();}
});
test('New enrollment creates separate receivables once and does not invent VIP amounts',async()=>{
 for(const vip of [false,true]){
  const t=await setup();t.a.novaMatricula();const f=t.w.document.getElementById('studentForm');
  f.elements.nome.value=vip?'VIP sintética':'Nova aluna sintética';
  f.querySelector('input[name="modalidades"]').checked=true;
  f.querySelector('input[name="turmaIds"]').checked=true;
  f.elements.valorMatricula.value=vip?'VIP':'60';
  f.elements.mensalidadeOpcao.value=vip?'VIP':'255';
  f.elements.mensalidadeOpcao.onchange();
  await f.onsubmit({preventDefault(){},currentTarget:f});
  assert.equal(t.client.tables.financeiro.length,vip?0:2);
  assert.deepEqual(t.client.tables.financeiro.map(r=>r.valor).sort((a,b)=>a-b),vip?[]:[60,255]);
  assert.deepEqual(t.client.tables.financeiro.map(r=>r.tipo).sort(),vip?[]:['entrada','mensalidade']);
  assert(t.client.tables.financeiro.every(r=>r.status==='em_aberto'));
  const sid=t.a.db.students.at(-1).id;t.a.novaMatricula(sid);
  const edit=t.w.document.getElementById('studentForm');
  await edit.onsubmit({preventDefault(){},currentTarget:edit});
  assert.equal(t.client.tables.financeiro.length,vip?0:2);
  t.close();
 }
});
test('Retry after finance failure does not duplicate enrollment or charges',async()=>{
 const client=fakeClient(),rpc=client.rpc.bind(client);let failOnce=true;
 client.rpc=async(name,p)=>{
  if(p?.p_tabela==='financeiro'&&failOnce){failOnce=false;return {error:{message:'Falha financeira simulada'}};}
  return rpc(name,p);
 };
 const t=app(client);await t.a.loadSupabaseDb();t.a.novaMatricula();
 const f=t.w.document.getElementById('studentForm');f.elements.nome.value='Aluna de teste';
 f.querySelector('input[name="modalidades"]').checked=true;f.querySelector('input[name="turmaIds"]').checked=true;f.elements.valorMatricula.value='60';
 await assert.rejects(f.onsubmit({preventDefault(){},currentTarget:f}),/Falha financeira simulada/);
 assert.equal(t.client.tables.alunas.length,3);assert.equal(t.client.tables.financeiro.length,0);
 await f.onsubmit({preventDefault(){},currentTarget:f});
 assert.equal(t.client.tables.alunas.length,3);assert.equal(t.client.tables.financeiro.length,2);
 t.close();
});
test('Existing enrollments can generate missing receivables without duplicates',async()=>{
 const t=await setup();
 t.a.db.students[0].dataMatricula='2026-09-29';t.a.db.students[0].valorMatricula='150';
 t.a.db.students[1].dataMatricula='2026-09-29';t.a.db.students[1].mensalidade='VIP';t.a.db.students[1].valorMatricula='VIP';
 await t.a.save();
 await t.w.eval('gerarCobrancasExistentes()');
 assert.deepEqual(t.client.tables.financeiro.map(r=>r.valor).sort((a,b)=>a-b),[255]);
 await t.w.eval('gerarCobrancasExistentes()');
 assert.equal(t.client.tables.financeiro.length,1);
 t.close();
});
test('Load failure never replaces existing data with partial data',async()=>{const t=await setup();const previous=JSON.stringify(t.a.db);t.client.fail({table:'alunas',message:'network'});await assert.rejects(t.a.loadSupabaseDb());assert.equal(JSON.stringify(t.a.db),previous);t.close();});
test('Failed write stays pending, no false success',async()=>{const t=await setup();t.a.db.students[0].obs='Pendente';t.client.fail({message:'RLS denied'});await assert.rejects(t.a.save());assert.equal(t.a.pending,true);assert.match(t.w.document.getElementById('saveStatus').textContent,/Não salvo/);t.client.fail(null);await t.a.save();assert.equal(t.a.pending,false);t.close();});
test('Unchanged rows are not rewritten',async()=>{const t=await setup();await t.a.save();assert.equal(writeRpcCalls(t).length,0);t.close();});
test('Concurrent saves share one in-flight write',async()=>{const t=await setup();t.a.db.students[0].obs='Uma escrita';await Promise.all([t.a.save(),t.a.save()]);assert.equal(writeRpcCalls(t).length,1);t.close();});
test('Optimistic conflict does not overwrite newer server row',async()=>{const t=await setup();t.client.tables.alunas[0].fenix_version=5;t.a.db.students[0].obs='antigo';await assert.rejects(t.a.save(),/Conflito/);assert.equal(t.client.tables.alunas[0].dados_fenix.obs,'Adaptação');t.close();});
test('Attendance is persisted with four distinct statuses',async()=>{const t=await setup();for(const status of ['Presente','Ausente','Falta justificada','Atestado médico']){const a={id:900+t.a.db.attendance.length,data:'2026-09-23',turmaId:t.a.db.classes[0].id,studentIds:[t.a.db.students[0].id],status:[status],pres:[status==='Presente'],obs:'Aula'};t.a.db.attendance.push(a);await t.a.save();await t.a.loadSupabaseDb();assert.equal(t.a.db.attendance.at(-1).status[0],status);}t.close();});
test('Teacher does not load finance and cannot write administrative data',async()=>{const t=app();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};await t.a.loadSupabaseDb();assert(!t.client.calls.some(c=>c.table==='financeiro'));t.a.db.teachers[0].nome='Tentativa';await assert.rejects(t.a.save(),/permissão/);t.close();});
test('Teacher UUID maps to class; same name never grants access',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora B'};assert.equal(t.a.visibleClasses().length,1);assert.equal(t.a.visibleStudents().length,1);assert.equal(t.a.teacherOwnsClass(t.a.db.classes[1]),false);t.close();});
test('Teacher observations use scoped RPC',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.db.students[0].obs='Adaptação nova';await t.a.save();const call=t.client.calls.find(c=>c.type==='rpc'&&c.name==='fenix_salvar_observacao_professora');assert.equal(call.p.p_obs,'Adaptação nova');t.close();});
test('Shared observations show the legacy note and append named entries for only the selected student',async()=>{
 const tables=fixtures();tables.perfis=[{id:'author-a',nome:'Professora de Ballet'}];tables.observacoes=[
  {id:'note-a',aluna_id:ids.student,autora_id:'author-a',visibilidade:'compartilhada',conteudo:'Ajustar postura no giro.',created_at:'2026-10-30T12:00:00Z'},
  {id:'note-b',aluna_id:ids.student2,autora_id:'author-a',visibilidade:'compartilhada',conteudo:'Nota de outra aluna.',created_at:'2026-10-30T12:01:00Z'}
 ];
 const t=app(fakeClient(tables));t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora de Jazz',authUserId:ids.teacherAuth};await t.a.loadSupabaseDb();
 const student=t.a.db.students.find(s=>t.a.remoteForLocal('alunas',s.id)===ids.student);t.a.abrirAluno(student.id);
 let text=t.w.document.getElementById('modalbox').textContent;assert.match(text,/Adaptação/);assert.match(text,/Professora de Ballet/);assert(!text.includes('Nota de outra aluna.'));
 const field=t.w.document.getElementById('teacherObs');field.value='Boa evolução no deslocamento.';assert.equal(await t.a.salvarObsProf(student.id),true);
 assert.equal(tables.observacoes.length,3);const saved=tables.observacoes.at(-1);assert.equal(saved.aluna_id,ids.student);assert.equal(saved.autora_id,ids.teacherAuth);assert.equal(saved.visibilidade,'compartilhada');assert.equal(saved.conteudo,'Boa evolução no deslocamento.');
 assert.equal(student.obs,'Adaptação');text=t.w.document.getElementById('modalbox').textContent;assert.match(text,/Boa evolução no deslocamento/);assert.match(text,/Professora de Jazz/);t.close();
});
test('Shared observations report a denied write without appending it locally',async()=>{
 const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora',authUserId:ids.teacherAuth};await t.a.loadSupabaseDb();const student=t.a.db.students[0];t.a.abrirAluno(student.id);t.w.document.getElementById('teacherObs').value='Nota sintética';t.client.fail({table:'observacoes',message:'new row violates row-level security policy'});assert.equal(await t.a.salvarObsProf(student.id),false);assert.equal(t.a.db.observations.length,0);assert.match(t.alerts.at(-1),/Não foi possível adicionar/);t.close();
});
test('Teacher attendance uses scoped RPC for own class',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.db.attendance.push({id:901,data:'2026-09-23',turmaId:t.a.db.classes[0].id,studentIds:[t.a.db.students[0].id],status:['Presente'],pres:[true],obs:'Aula'});await t.a.save();const call=t.client.calls.find(c=>c.type==='rpc'&&c.name==='fenix_salvar_aula_professora');assert.equal(call.p.p_turma,ids.class);t.close();});
test('Teacher records only attendance for own experimental; failed write stays visible',async()=>{
 const tables=fixtures();tables.aulas_experimentais=[{id:'60000000-0000-4000-8000-000000000001',nome:'Visitante',telefone:'11999999999',modalidade:'Ballet',data:'2026-09-30',horario:'18:00',professora_id:ids.teacher,status:'Confirmada',dados_fenix:{confirmacao:'Confirmou',matricula:''}},{id:'60000000-0000-4000-8000-000000000002',nome:'Outra',telefone:'11999999998',modalidade:'Ballet',data:'2026-09-30',horario:'19:00',professora_id:ids.teacher2,status:'Agendada'}];
 const t=app(fakeClient(tables));t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};await t.a.loadSupabaseDb();
 t.a.view='experimentais';t.a.render();assert(!t.w.document.getElementById('page').textContent.includes('Outra'));
 const own=t.a.db.experimental[0],other=t.a.db.experimental[1];
 assert.throws(()=>t.w.eval(`verExperimental(${other.id})`),/não vinculada/);
 t.w.eval(`verExperimental(${own.id})`);const form=t.w.document.getElementById('teacherExperimentalForm');assert(form);assert(!form.elements.matricula);
 form.elements.presenca.value='Compareceu';t.client.fail({message:'Falha simulada'});await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(own.presenca,'');assert.match(t.w.document.getElementById('saveStatus').textContent,/Não salvo/);
 t.client.fail(null);await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.client.tables.aulas_experimentais[0].dados_fenix.presenca,'Compareceu');assert.equal(t.client.tables.aulas_experimentais[0].dados_fenix.confirmacao,'Confirmou');assert.match(t.w.document.getElementById('saveStatus').textContent,/salvo no banco/);t.close();
});
test('Class schedule collision explains the conflict without claiming a save',async()=>{
 const t=await setup();t.a.db.classes[0].dia='Sábado';t.client.rpc=async()=>({error:{code:'23505',message:'duplicate key violates unique constraint "uq_turma_horario_ativo"'}});
 await assert.rejects(t.a.save(),/Já existe uma turma ativa em Sábado às 18:00/);
 assert.match(t.w.document.getElementById('saveStatus').textContent,/Não salvo/);t.close();
});
test('Teacher cannot edit other student or tuition',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.db.students[0].mensalidade=1;await assert.rejects(t.a.save(),/somente/);t.close();});
test('Teacher search excludes unrelated student and staff data',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.view='busca';t.a.render();const input=t.w.document.getElementById('globalSearch');input.value='Aluna';input.oninput();assert.match(t.w.document.getElementById('searchResults').textContent,/Aluna A/);assert(!t.w.document.getElementById('searchResults').textContent.includes('Aluna B'));t.close();});
test('Administrative entry points reject teacher calls',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher};for(const f of ['novaMatricula','novoProfessor','novaTurma','novaMensalidade','novaConta','novoEvento','novaComemorativa','novoFeriado','exportBackup'])assert.throws(()=>t.a[f](),/administrativo/);t.close();});
test('Attendance viewer rejects unrelated class',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher};t.a.db.attendance.push({id:9,turmaId:t.a.db.classes[1].id});assert.throws(()=>t.a.abrirPresenca(9),/autorizada/);t.close();});
test('HTTP 500, HTML 200 and ok=false are rejected',async()=>{const t=await setup();for(const response of [{ok:false,status:500},{ok:true,json:async()=>{throw Error('HTML')}},{ok:true,json:async()=>({ok:false,error:'denied'})}]){t.w.fetch=async()=>response;await assert.rejects(t.a.callFenixAppsScript('test'));}t.close();});
test('Photos reject scripts and SVG and escape URL attributes',()=>{const t=app();assert.equal(t.a.safePhoto('javascript:alert(1)'), '');assert.equal(t.a.safePhoto('data:image/svg+xml,<svg onload=alert(1)>'),'');assert(!t.a.safePhoto('https://example.test/" onerror="x').includes('"'));t.close();});
test('Event and commemorative forms use currentTarget and persist',async()=>{const t=await setup();for(const [method,formId,coll] of [['novoEvento','eventForm','events'],['novaComemorativa','commForm','commemorative']]){t.a[method]();const form=t.w.document.getElementById(formId);form.elements.nome.value='Evento sintético';form.elements.data.value='2026-10-10';await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db[coll][0].nome,'Evento sintético');}t.close();});
test('Calendar calculates Easter-related dates and nth-weekday anniversaries for future years',async()=>{
 const t=app();
 t.client.tables.datas_comemorativas.push({id:'70000000-0000-4000-8000-000000000001',nome:'Dia das Mães',data:'2027-05-09',observacao:'Segundo domingo de maio',ativo:true,dados_fenix:{origem:'calendario_aprovado_2027',recorrencia:{tipo:'dia_semana_mes',mes:5,weekday:0,ordem:2},classificacoes:['comemoracao']}});
 t.client.tables.feriados.push({id:'70000000-0000-4000-8000-000000000002',data:'2027-02-08',nome:'Carnaval',abrangencia:'federal',tipo:'ponto_facultativo',ativo:true,dados_fenix:{recorrencia:{tipo:'pascoa_intervalo',inicio:-48,fim:-47},data_fim:'2027-02-09'}});
 await t.a.loadSupabaseDb();
 assert.equal(t.w.eval("easterDate(2027)"),'2027-03-28');
 assert.equal(t.a.commemorativesForYear(2028)[0].data,'2028-05-14');
 const carnival=t.a.holidaysForYear(2028)[0];assert.equal(carnival.data,'2028-02-28');assert.equal(carnival.data_fim,'2028-02-29');
 t.a.view='aniversarios';t.a.render();assert.match(t.w.document.getElementById('page').textContent,/Calendário administrativo/);assert.match(t.w.document.getElementById('page').textContent,/Ponto facultativo/);t.close();
});
test('Administrators can add, edit and deactivate separate calendar entries',async()=>{
 const t=await setup();
 t.a.novaComemorativa();let form=t.w.document.getElementById('commForm');form.elements.nome.value='Aniversário do Estúdio';form.elements.data.value='2027-08-16';
 await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.client.tables.datas_comemorativas[0].dados_fenix.recorrencia.tipo,'fixa');
 t.a.novoFeriado();form=t.w.document.getElementById('holidayForm');form.elements.nome.value='Feriado sintético';form.elements.data.value='2027-03-26';form.elements.abrangencia.value='municipal';
 await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.client.tables.feriados[0].abrangencia,'municipal');
 const id=t.a.db.holidays[0].id;await t.a.alternarFeriado(id);assert.equal(t.client.tables.feriados[0].ativo,false);await t.a.alternarFeriado(id);assert.equal(t.client.tables.feriados[0].ativo,true);
 await t.a.loadSupabaseDb();assert.equal(t.a.db.holidays[0].nome,'Feriado sintético');t.close();
});
test('Failed new event retry reuses same draft identity',async()=>{const t=await setup();t.a.novoEvento();const form=t.w.document.getElementById('eventForm');form.elements.nome.value='Evento';form.elements.data.value='2026-10-10';t.client.fail({message:'offline'});await assert.rejects(form.onsubmit({preventDefault(){},currentTarget:form}));t.client.fail(null);await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db.events.length,1);assert.equal(t.client.tables.eventos.length,1);t.close();});
test('All administrative views render and wire without error',async()=>{const t=await setup();for(const view of Object.keys(t.a.V)){t.a.view=view;t.a.render();assert(t.w.document.getElementById('page').textContent.trim());}t.close();});
test('Contract preview keeps unsaved enrollment form',async()=>{const t=await setup();t.a.novaMatricula();const form=t.w.document.getElementById('studentForm');form.elements.nome.value='Rascunho';t.a.visualizarContrato(0);assert.equal(t.w.document.getElementById('studentForm').elements.nome.value,'Rascunho');t.close();});
test('Other access login available without cached teacher',async()=>{const t=app();await t.a.renderLogin();const select=t.w.document.getElementById('loginUser');select.value='email';select.onchange();assert.equal(t.w.document.getElementById('loginEmail').hidden,false);t.close();});
test('Missing auth profile is rejected, old project never consulted',async()=>{const t=app();t.client.auth.signInWithPassword=async()=>({data:{user:{id:'none'}}});await t.a.renderLogin();await t.w.document.getElementById('loginEnter').onclick({preventDefault(){}});assert.equal(t.a.session,null);assert(t.alerts.some(s=>s.includes('desativado')));assert(!html.includes('LEGACY_SUPABASE_CONFIG'));t.close();});
test('Unknown role denied even if profile is active',async()=>{const t=app();t.client.tables.perfis=[{id:'none',status:'ativo',papel:'visitor'}];t.client.auth.signInWithPassword=async()=>({data:{user:{id:'none'}}});await t.a.renderLogin();await t.w.document.getElementById('loginEnter').onclick({preventDefault(){}});assert.equal(t.a.session,null);t.close();});
test('Invitation opens password setup once after authenticated redirect',async()=>{const t=app(fakeClient(),'https://example.test/#access_token=synthetic&type=invite');t.a.initSupabase();t.client.auth.emitAuth('SIGNED_IN');await new Promise(resolve=>queueMicrotask(resolve));assert(t.w.document.getElementById('newPassword'));t.client.auth.emitAuth('SIGNED_IN');assert.equal(t.w.document.querySelectorAll('#newPassword').length,1);t.close();});
test('Logout removes previous user data from memory and page',async()=>{const t=await setup();await t.a.start();await t.a.logout();assert.equal(t.a.db.students.length,0);assert.equal(t.w.document.getElementById('page').textContent,'');t.close();});
test('Secrets do not enter supplemental metadata',()=>{const t=app();assert.deepEqual(JSON.parse(JSON.stringify(t.a.cleanExtra({id:1,senha:'test',password:'test',access_token:'test',nome:'Nome'}))),{nome:'Nome'});t.close();});

test('Financial edits preserve negotiated and cancelled status and payment timestamp',async()=>{
 for(const status of ['negociado','cancelado','pago']){
  const t=app();const timestamp='2026-09-20T23:45:00+00:00';
  t.client.tables.financeiro.push({id:'50000000-0000-4000-8000-000000000001',aluna_id:ids.student,tipo:'mensalidade',descricao:'Setembro',valor:200,status,pago_em:status==='pago'?timestamp:null});
  await t.a.loadSupabaseDb();t.a.db.payments[0].comp='Descrição revisada';await t.a.save();
  assert.equal(t.client.tables.financeiro[0].status,status);
  assert.equal(t.client.tables.financeiro[0].pago_em,status==='pago'?timestamp:null);t.close();
 }
});

test('Duplicate teachers sharing phone are consolidated even when metadata differs',async()=>{
 const tables=fixtures();
 tables.professoras=[
  {id:ids.teacher,nome:'Alê',telefone:'11983190510',status:'ativo',dados_fenix:{email:'ale@example.test'}},
  {id:ids.teacher2,nome:'Alê',telefone:'11983190510',status:'ativo',dados_fenix:{}}
 ];
 const t=app(fakeClient(tables));await t.a.loadSupabaseDb();
 assert.equal(t.a.uniqueTeachers().length,1);
 t.close();
});
test('Same name alone does not merge different teachers',async()=>{
 const t=app();
 t.a.db.teachers=[{id:1,nome:'Ana Silva',email:'ana1@example.test'},{id:2,nome:'Ana Silva',email:'ana2@example.test'}];
 assert.equal(t.a.uniqueTeachers().length,2);
 t.close();
});
test('Registrations sort by Portuguese names without changing saved order or teacher scope',async()=>{
 const t=await setup();
 try{
 t.a.db.students[0].nome='Zoé';t.a.db.students[1].nome='Álvaro';
 t.a.db.classes[0].nome='Jazz 10';t.a.db.classes[1].nome='Ballet 2';
 t.a.db.teachers[0].nome='Zoé';t.a.db.teachers[1].nome='Álvaro';
 assert.deepEqual(Array.from(t.a.visibleStudents(),x=>x.nome),['Álvaro','Zoé']);
 assert.deepEqual(Array.from(t.a.visibleClasses(),x=>x.nome),['Ballet 2','Jazz 10']);
 assert.deepEqual(Array.from(t.a.uniqueTeachers(),x=>x.nome),['Álvaro','Zoé']);
 assert.deepEqual(Array.from(t.a.db.students,x=>x.nome),['Zoé','Álvaro']);
 t.a.view='alunos';t.a.render();
 const names=[...t.w.document.querySelectorAll('#studentTable td:nth-child(3) strong')].map(x=>x.textContent);
 assert.deepEqual(names,['Álvaro','Zoé']);
 t.a.session={tipo:'teacher',teacherId:ids.teacher};assert.deepEqual(Array.from(t.a.visibleStudents(),x=>x.nome),['Zoé']);
 }finally{t.close();}
});
test('Teacher form refuses duplicate active email while allowing edits to existing record',async()=>{
 const t=await setup();const original=t.a.db.teachers.length;
 t.a.novoProfessor();let form=t.w.document.getElementById('profForm');
 form.elements.nome.value='Outra professora';form.elements.email.value=t.a.db.teachers[0].email;
 await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(t.a.db.teachers.length,original);
 assert(t.alerts.some(s=>s.includes('cadastro ativo')));
 t.a.novoProfessor(t.a.db.teachers[0].id);form=t.w.document.getElementById('profForm');
 form.elements.apelido.value='Apelido revisado';
 await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(t.a.db.teachers[0].apelido,'Apelido revisado');
 t.close();
});
test('Legacy browser teacher data never overrides Supabase',async()=>{
 const t=app();
 t.w.localStorage.setItem('fenix_gestao_v2',JSON.stringify({teachers:[{id:77,nome:'Professora A',email:'legacy@example.test',foto:'data:image/png;base64,AAAA'}]}));
 await t.a.loadSupabaseDb();
 assert.equal(t.a.db.teachers[0].email,'teacher@example.test');
 assert.notEqual(t.a.db.teachers[0].foto,'data:image/png;base64,AAAA');
 t.close();
});
test('Legacy login label may appear but cannot bypass Supabase profile authorization',async()=>{
 const t=app();
 t.a.db={...t.a.db,teachers:[]};
 t.w.localStorage.setItem('fenix_gestao_v2',JSON.stringify({teachers:[{id:88,nome:'Professora antiga',email:'legacy@example.test',acessoAtivo:true}]}));
 t.client.auth.signInWithPassword=async()=>({data:{user:{id:'none',email:'legacy@example.test'}}});
 await t.a.renderLogin();
 const select=t.w.document.getElementById('loginUser');select.value='prof:88';select.onchange();
 assert.match(select.textContent,/Professora antiga/);
 await t.w.document.getElementById('loginEnter').onclick({preventDefault(){}});
 assert.equal(t.a.session,null);
 t.close();
});

test('Public contract loads by RPC, confirms acceptance and handles already accepted links',async()=>{
 for(const status of ['enviado','aceito']){
  const client=fakeClient();const calls=[];
  client.rpc=async(name,p)=>{calls.push({name,p});return {data:name==='fenix_consultar_contrato'?{conteudo:'Contrato sintético',status,aceito_em:status==='aceito'?'2026-09-29T12:00:00Z':null}:'aceito'};};
  const t=app(client,'https://example.test/?contrato=0123456789abcdef0123456789abcdef');
  try{
   await t.w.eval('startContractAcceptance()');
   assert.equal(calls[0].name,'fenix_consultar_contrato');
   const d=t.w.document;
   if(status==='aceito'){assert.match(d.body.textContent,/já foi aceito/);assert.equal(d.getElementById('acceptButton'),null);}
   else{
    d.getElementById('acceptName').value='Teste';d.getElementById('acceptDocument').value='Documento sintético';d.getElementById('acceptCheck').checked=true;
    await d.getElementById('acceptButton').onclick();
    assert.match(d.getElementById('acceptResult').textContent,/aceito com sucesso/);
    assert.equal(calls[1].name,'aceitar_contrato');assert.equal(d.getElementById('acceptButton').disabled,true);
   }
   assert.equal(client.calls.length,0);
  }finally{t.close();}
 }
});

test('Public contract network errors do not claim the link is invalid',async()=>{
 const client=fakeClient();client.rpc=async()=>{throw new Error('Rede indisponível')};
 const t=app(client,'https://example.test/?contrato=0123456789abcdef0123456789abcdef');
 try{await t.w.eval('startContractAcceptance()');assert.match(t.w.document.body.textContent,/Não foi possível carregar/);assert.doesNotMatch(t.w.document.body.textContent,/inválido|expirou/);}finally{t.close();}
});

test('Zero check-in is hidden from monthly list without fee, payment action or pending count after reload',async()=>{
 const client=fakeClient();client.tables.alunas[0].nome='Jaqueline';Object.assign(client.tables.alunas[0].dados_fenix,{checkin:'Wellhub',mensalidade:null,valorMatricula:'isento'});
 for(const [i,tipo,valor] of [[1,'mensalidade',0],[2,'entrada',60]])client.tables.financeiro.push({id:`50000000-0000-4000-8000-00000000000${i}`,aluna_id:ids.student,tipo,descricao:tipo==='entrada'?'Matrícula':'2026-09',valor,status:'cancelado',vencimento:'2026-09-10'});
 const t=app(client);try{
  for(let i=0;i<2;i++){
   await t.a.loadSupabaseDb();t.a.view='mensalidades';t.a.render();
   const rows=[...t.w.document.querySelectorAll('#page tr')].filter(r=>r.textContent.includes('Jaqueline'));
   assert.equal(rows.length,0);assert.equal(t.w.document.querySelectorAll('#page button[onclick^="receber"]').length,0);
   assert.equal(t.a.db.payments.filter(t.w.financePending).length,0);
  }
  assert.equal(client.calls.filter(c=>c.type==='rpc'&&c.name!=='fenix_listar_observacoes_compartilhadas').length,0);assert.equal(client.tables.financeiro.length,2);
 }finally{t.close();}
});

test('Manually launched zero check-in stays hidden before and after reload',async()=>{
 const t=await setup();try{
  Object.assign(t.a.db.students[0],{checkin:'Wellhub',mensalidade:0,diaVenc:'10'});
  await t.a.save();t.a.view='mensalidades';t.a.novaMensalidade();
  const form=t.w.document.getElementById('payForm');await form.onsubmit({preventDefault(){},currentTarget:form});
  for(let i=0;i<2;i++){
   if(i)await t.a.loadSupabaseDb();t.a.render();
   assert.doesNotMatch(t.w.document.getElementById('page').textContent,/Check-in · sem cobrança/);
   assert.equal(t.w.document.querySelectorAll('#page button[onclick^="receber"]').length,0);
   assert.equal(t.a.db.payments.filter(t.w.financePending).length,0);
  }
 }finally{t.close();}
});

test('Experimental WhatsApp sends a utility template without confirming attendance',async()=>{
 const t=await setup();
 try{
  const x={id:901,nome:'Visitante',fone:'11999999999',modalidade:'Ballet',data:t.a.nowISO(),hora:'18:00',profId:t.a.db.teachers[0].id,status:'Agendada',confirmacao:''};t.a.db.experimental.push(x);
  let payload;t.w.fetch=async(url,options)=>{payload=options.body;return {ok:true,status:200,json:async()=>({ok:true,identificador_externo:'synthetic-test-message'})};};
  t.w.eval("gerarCardExperimental=async()=> 'data:image/jpeg;base64,/9j/2Q=='");
  await t.w.eval('enviarExperimentalWhatsApp(901)');
  assert.equal(payload.get('template'),'fenix_confirmacao_experimental_card_curto');assert.equal(payload.get('card_base64'),'/9j/2Q==');assert.deepEqual(JSON.parse(payload.get('template_params')),['Visitante','Ballet',t.a.nowISO().split('-').reverse().join('/'),'18:00']);
  assert.equal(x.status,'Agendada');assert.equal(x.confirmacao,'');assert(!t.client.calls.some(c=>c.table==='aulas_experimentais'&&c.type==='update'));
  assert.equal(t.client.tables.comunicacoes.length,1);assert.match(t.alerts.at(-1),/aguardando a resposta/);
  t.a.session={tipo:'teacher',teacherId:ids.teacher};await assert.rejects(t.w.eval('enviarExperimentalWhatsApp(901)'),/administrativo/);
 }finally{t.close();}
});
test('Experimental WhatsApp blocks duplicate in-flight sends and preserves state on rejection',async()=>{
 const t=await setup();
 try{
  const x={id:902,nome:'Visitante',fone:'11999999999',modalidade:'Ballet',data:t.a.nowISO(),hora:'18:00',status:'Agendada'};t.a.db.experimental.push(x);
  let release,count=0;t.w.fetch=()=>{count++;return new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>({ok:false,error:'Modelo em análise'})});});};
  t.w.eval("gerarCardExperimental=async()=> 'data:image/jpeg;base64,/9j/2Q=='");
  const first=t.w.eval('enviarExperimentalWhatsApp(902)');await new Promise(resolve=>setImmediate(resolve));await t.w.eval('enviarExperimentalWhatsApp(902)');assert.equal(count,1);release();await first;
  assert.equal(x.status,'Agendada');assert.equal(t.client.tables.comunicacoes.length,0);assert.match(t.alerts.at(-1),/Modelo em análise/);
 }finally{t.close();}
});

test('Admin registers and edits an inquiry with channel separate from discovery source',async()=>{
 const t=app();
 try{
  await t.a.loadSupabaseDb();t.a.view='interessadas';t.a.render();t.a.novaInteressada();
  let form=t.w.document.getElementById('leadForm');
  Object.assign(form.elements.nome,{value:'Contato de teste'});Object.assign(form.elements.telefone,{value:'11999990000'});Object.assign(form.elements.modalidade,{value:'Jazz'});
  form.elements.canalContato.value='direct';form.elements.origem.value='instagram';form.elements.status.value='em_atendimento';form.elements.observacoes.value='Perguntou sobre horários.';
  await form.onsubmit({preventDefault(){}});
  assert.equal(t.client.tables.interessadas.length,1);
  const row=t.client.tables.interessadas[0];assert.equal(row.canal_contato,'direct');assert.equal(row.origem,'instagram');assert.equal(row.status,'em_atendimento');assert.deepEqual(row.dados_fenix,{});
  assert(t.client.calls.some(c=>c.type==='rpc'&&c.name==='fenix_salvar_interessada'));
  await t.a.loadSupabaseDb();t.a.view='interessadas';t.a.render();
  assert.match(t.w.document.getElementById('interessadasTable').textContent,/Contato de teste/);
  t.a.novaInteressada(t.a.db.leads[0].id);form=t.w.document.getElementById('leadForm');form.elements.status.value='matriculada';form.elements.observacoes.value='Matrícula concluída.';await form.onsubmit({preventDefault(){}});
  assert.equal(t.client.tables.interessadas[0].status,'matriculada');assert.equal(t.client.tables.interessadas[0].fenix_version,2);
  t.a.session={id:'teacher-test',authUserId:'teacher-test',tipo:'teacher',teacherId:ids.teacher};t.a.view='interessadas';t.a.render();
  assert.equal(t.w.document.querySelector('[data-view="interessadas"]').style.display,'none');assert.doesNotMatch(t.w.document.getElementById('page').textContent,/Novo contato/);
  t.a.go('interessadas');assert.equal(t.a.V.interessadas!==undefined,true);assert.equal(t.w.document.getElementById('page').textContent.includes('Interessadas'),false);
 }finally{t.close();}
});

test('Dashboard daily inquiry reminder is persisted per admin and date',async()=>{
 const t=app();try{
  await t.a.loadSupabaseDb();t.a.view='painel';t.a.render();assert.match(t.w.document.getElementById('page').textContent,/Conferir contatos recebidos/);
  await t.a.marcarContatosConferidos();assert.deepEqual(t.client.tables.revisoes_contatos_diarias.map(r=>({admin_id:r.admin_id,revisado_em:r.revisado_em})),[{admin_id:'admin-test',revisado_em:t.a.nowISO()}]);
  assert.doesNotMatch(t.w.document.getElementById('page').textContent,/Conferir contatos recebidos/);
 }finally{t.close();}
});
