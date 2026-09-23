import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
export const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
export const ids={teacher:'10000000-0000-4000-8000-000000000001',teacher2:'10000000-0000-4000-8000-000000000002',class:'20000000-0000-4000-8000-000000000001',class2:'20000000-0000-4000-8000-000000000002',student:'30000000-0000-4000-8000-000000000001',student2:'30000000-0000-4000-8000-000000000002',mod:'40000000-0000-4000-8000-000000000001'};
export function fixtures(){return {
 professoras:[{id:ids.teacher,nome:'Professora A',status:'ativo',dados_fenix:{email:'teacher@example.test'}},{id:ids.teacher2,nome:'Professora B',status:'ativo'}],
 modalidades:[{id:ids.mod,nome:'Ballet'}],
 turmas:[{id:ids.class,nome:'Ballet A',modalidade_id:ids.mod,dia_semana:1,horario:'18:00',professora_id:ids.teacher,status:'ativo'},{id:ids.class2,nome:'Ballet B',modalidade_id:ids.mod,dia_semana:2,horario:'19:00',professora_id:ids.teacher2,status:'ativo'}],
 alunas:[{id:ids.student,nome:'Aluna A',status:'ativo',dados_fenix:{mensalidade:255,alergias:'Sim',saudeObs:'Informação sintética',obs:'Adaptação',objetivos:['Lazer']}},{id:ids.student2,nome:'Aluna B',status:'ativo',dados_fenix:{mensalidade:335}}],
 matriculas_turmas:[{id:'m1',aluna_id:ids.student,turma_id:ids.class,status:'ativa'},{id:'m2',aluna_id:ids.student2,turma_id:ids.class2,status:'ativa'}],
 financeiro:[],eventos:[],datas_comemorativas:[],aulas:[],presencas:[],comunicacoes:[],contratos:[]};}
export function fakeClient(tables=fixtures()){
 const calls=[];let failure=null;
 const client={tables,calls,fail(value){failure=value;},auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test-token'}}}),signOut:async()=>({}),onAuthStateChange(){},resetPasswordForEmail:async()=>({}),updateUser:async()=>({})},
 from(table){
  let start=0,end=Infinity;const filters=[];let mode='select',payload;
  const q={select(){return q;},order(){return q;},range(a,b){start=a;end=b;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},limit(){return q;},insert(p){mode='insert';payload=p;return q;},update(p){mode='update';payload=p;return q;},delete(){mode='delete';return q;},single(){return q.then(r=>({...r,data:r.data?.[0]||null}));},maybeSingle(){return q.single();},then(resolve,reject){
   calls.push({type:mode,table});
   if(failure&&(!failure.table||failure.table===table))return Promise.resolve({error:failure}).then(resolve,reject);
   let data=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
   if(mode==='insert'){data=[{id:webcrypto.randomUUID(),...payload}];(tables[table]??=[]).push(...data);}
   if(mode==='update')data.forEach(r=>Object.assign(r,payload));
   return Promise.resolve({data:structuredClone(data.slice(start,end+1)),error:null}).then(resolve,reject);
  }};return q;
 },
 async rpc(name,p){calls.push({type:'rpc',name,p:structuredClone(p)});if(failure)return {error:failure};
  if(name!=='fenix_salvar_registro')return {data:true};
  const rows=tables[p.p_tabela];let row=rows.find(r=>r.id===p.p_id);
  if(row&&Number(row.fenix_version||0)!==p.p_versao)return {error:{code:'40001',message:'Conflito de versão'}};
  if(!row){row={id:p.p_id};rows.push(row);}Object.assign(row,structuredClone(p.p_dados),{fenix_version:p.p_versao+1});
  if(p.p_vinculos?.presencas)for(const record of p.p_vinculos.presencas){let old=tables.presencas.find(r=>r.aula_id===row.id&&r.aluna_id===record.aluna_id);if(old)Object.assign(old,record);else tables.presencas.push({id:webcrypto.randomUUID(),aula_id:row.id,...record});}
  return {data:{id:row.id,fenix_version:row.fenix_version}};
 }};return client;
}
export function app(client=fakeClient()){
 const dom=new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;const alerts=[];
 w.structuredClone=structuredClone;w.alert=x=>alerts.push(x);w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 Object.defineProperty(w.crypto,'randomUUID',{value:()=>webcrypto.randomUUID()});
 w.supabase={createClient:()=>client};w.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true})});
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1].replace('\nstartFenix();','');
 w.eval(script+`\nwindow.testAPI={get db(){return db},set db(x){db=x},get session(){return session},set session(x){session=x},get ids(){return remoteIds},set ids(x){remoteIds=x},set client(x){supabaseClient=x;supabaseReady=true},get pending(){return hasPendingChanges()},get V(){return V},set view(x){view=x},set loaded(x){dataLoaded=x},set owner(x){cacheOwner=x},checkpoint,loadSupabaseDb,save,remoteForLocal,localForRemote,cleanExtra,visibleStudents,visibleClasses,teacherOwnsClass,safePhoto,nowISO,callFenixAppsScript,renderLogin,render,start,logout,uniqueTeachers,teachersMatch,novaMatricula,novaTurma,novoProfessor,novaPresenca,novaMensalidade,novaConta,novoEvento,novaComemorativa,abrirPresenca,salvarObsProf,visualizarContrato,showPasswordRecovery,exportBackup};`);
 const a=w.testAPI;a.client=client;a.session={id:'admin-test',authUserId:'admin-test',nome:'Admin',tipo:'admin'};a.owner='admin-test';
 return {w,a,dom,client,alerts,close(){dom.window.close()}};
}
