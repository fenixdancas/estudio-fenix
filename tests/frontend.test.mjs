import test from 'node:test';import assert from 'node:assert/strict';
import {app,fixtures,fakeClient,ids,html} from './harness.mjs';
async function setup(){const t=app();await t.a.loadSupabaseDb();return t;}
test('IDs loaded from Supabase round-trip without insertion',async()=>{const t=await setup();const s=t.a.db.students[0];assert.equal(t.a.remoteForLocal('alunas',s.id),ids.student);s.obs='Atualizada';await t.a.save();assert.equal(t.client.tables.alunas.length,2);assert.equal(t.client.calls.filter(c=>c.type==='rpc').length,1);t.close();});
test('Save and reload preserves health, monthly amount and observations',async()=>{const t=await setup();const s=t.a.db.students[0];s.saudeObs='Nova observação';s.mensalidade=500;s.emergNome='Contato sintético';await t.a.save();await t.a.loadSupabaseDb();assert.equal(t.a.db.students[0].mensalidade,500);assert.equal(t.a.db.students[0].saudeObs,'Nova observação');assert.equal(t.a.db.students[0].emergNome,'Contato sintético');assert.equal(t.a.db.students[0].alergias,'Sim');t.close();});
test('No hardcoded tuition when source has no amount',async()=>{const t=app();delete t.client.tables.alunas[0].dados_fenix.mensalidade;await t.a.loadSupabaseDb();assert.equal(t.a.db.students[0].mensalidade,null);t.close();});
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
  if(p.p_tabela==='financeiro'&&failOnce){failOnce=false;return {error:{message:'Falha financeira simulada'}};}
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
test('Unchanged rows are not rewritten',async()=>{const t=await setup();await t.a.save();assert.equal(t.client.calls.filter(c=>c.type==='rpc').length,0);t.close();});
test('Concurrent saves share one in-flight write',async()=>{const t=await setup();t.a.db.students[0].obs='Uma escrita';await Promise.all([t.a.save(),t.a.save()]);assert.equal(t.client.calls.filter(c=>c.type==='rpc').length,1);t.close();});
test('Optimistic conflict does not overwrite newer server row',async()=>{const t=await setup();t.client.tables.alunas[0].fenix_version=5;t.a.db.students[0].obs='antigo';await assert.rejects(t.a.save(),/Conflito/);assert.equal(t.client.tables.alunas[0].dados_fenix.obs,'Adaptação');t.close();});
test('Attendance is persisted with four distinct statuses',async()=>{const t=await setup();for(const status of ['Presente','Ausente','Falta justificada','Atestado médico']){const a={id:900+t.a.db.attendance.length,data:'2026-09-23',turmaId:t.a.db.classes[0].id,studentIds:[t.a.db.students[0].id],status:[status],pres:[status==='Presente'],obs:'Aula'};t.a.db.attendance.push(a);await t.a.save();await t.a.loadSupabaseDb();assert.equal(t.a.db.attendance.at(-1).status[0],status);}t.close();});
test('Teacher does not load finance and cannot write administrative data',async()=>{const t=app();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};await t.a.loadSupabaseDb();assert(!t.client.calls.some(c=>c.table==='financeiro'));t.a.db.teachers[0].nome='Tentativa';await assert.rejects(t.a.save(),/permissão/);t.close();});
test('Teacher UUID maps to class; same name never grants access',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora B'};assert.equal(t.a.visibleClasses().length,1);assert.equal(t.a.visibleStudents().length,1);assert.equal(t.a.teacherOwnsClass(t.a.db.classes[1]),false);t.close();});
test('Teacher observations use scoped RPC',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.db.students[0].obs='Adaptação nova';await t.a.save();const call=t.client.calls.find(c=>c.type==='rpc');assert.equal(call.name,'fenix_salvar_observacao_professora');assert.equal(call.p.p_obs,'Adaptação nova');t.close();});
test('Teacher attendance uses scoped RPC for own class',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher,nome:'Professora'};t.a.db.attendance.push({id:901,data:'2026-09-23',turmaId:t.a.db.classes[0].id,studentIds:[t.a.db.students[0].id],status:['Presente'],pres:[true],obs:'Aula'});await t.a.save();const call=t.client.calls.find(c=>c.type==='rpc');assert.equal(call.name,'fenix_salvar_aula_professora');assert.equal(call.p.p_turma,ids.class);t.close();});
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
test('Administrative entry points reject teacher calls',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher};for(const f of ['novaMatricula','novoProfessor','novaTurma','novaMensalidade','novaConta','novoEvento','novaComemorativa','exportBackup'])assert.throws(()=>t.a[f](),/administrativo/);t.close();});
test('Attendance viewer rejects unrelated class',async()=>{const t=await setup();t.a.session={tipo:'teacher',teacherId:ids.teacher};t.a.db.attendance.push({id:9,turmaId:t.a.db.classes[1].id});assert.throws(()=>t.a.abrirPresenca(9),/autorizada/);t.close();});
test('HTTP 500, HTML 200 and ok=false are rejected',async()=>{const t=await setup();for(const response of [{ok:false,status:500},{ok:true,json:async()=>{throw Error('HTML')}},{ok:true,json:async()=>({ok:false,error:'denied'})}]){t.w.fetch=async()=>response;await assert.rejects(t.a.callFenixAppsScript('test'));}t.close();});
test('Photos reject scripts and SVG and escape URL attributes',()=>{const t=app();assert.equal(t.a.safePhoto('javascript:alert(1)'), '');assert.equal(t.a.safePhoto('data:image/svg+xml,<svg onload=alert(1)>'),'');assert(!t.a.safePhoto('https://example.test/" onerror="x').includes('"'));t.close();});
test('Event and commemorative forms use currentTarget and persist',async()=>{const t=await setup();for(const [method,formId,coll] of [['novoEvento','eventForm','events'],['novaComemorativa','commForm','commemorative']]){t.a[method]();const form=t.w.document.getElementById(formId);form.elements.nome.value='Evento sintético';form.elements.data.value='2026-10-10';await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db[coll][0].nome,'Evento sintético');}t.close();});
test('Failed new event retry reuses same draft identity',async()=>{const t=await setup();t.a.novoEvento();const form=t.w.document.getElementById('eventForm');form.elements.nome.value='Evento';form.elements.data.value='2026-10-10';t.client.fail({message:'offline'});await assert.rejects(form.onsubmit({preventDefault(){},currentTarget:form}));t.client.fail(null);await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(t.a.db.events.length,1);assert.equal(t.client.tables.eventos.length,1);t.close();});
test('All 13 administrative views render and wire without error',async()=>{const t=await setup();for(const view of Object.keys(t.a.V)){t.a.view=view;t.a.render();assert(t.w.document.getElementById('page').textContent.trim());}t.close();});
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
