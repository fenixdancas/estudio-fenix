import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../integrations/aniversarios.gs',import.meta.url),'utf8');
function setup({approved=true,failAt=0}={}){
 const values={}, sent=[],triggers=[];
 const props={getProperty:k=>values[k]??null,setProperty:(k,v)=>{values[k]=v;},deleteProperty:k=>{delete values[k];},getProperties:()=>({...values})};
 const lock={tryLock:()=>true,waitLock(){},releaseLock(){}};
 const c=vm.createContext({props_:()=>props,cfg_:()=> '1260005122934753',PROP:{META_WABA_ID:'waba'},normalizePhone_:p=>{const s=String(p||'').replace(/\D/g,'');return s.length===11?'55'+s:s;},whatsappConfig_:()=>({url:'https://graph.facebook.com/v25.0',phoneId:'1360494423811214',token:'test-token'}),metaJson_:()=>({data:[{name:'fenix_aniversario',language:'pt_BR',status:approved?'APPROVED':'PENDING',components:[{type:'HEADER',format:'IMAGE'}]}]}),LockService:{getScriptLock:()=>lock},Utilities:{formatDate:(d,tz,format)=>{const date=d.toLocaleDateString('en-CA',{timeZone:tz});return format==='yyyy-MM-dd'?date:date;}},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:()=>({timeBased(){return this;},everyDays(){return this;},atHour(){return this;},inTimezone(){return this;},create(){triggers.push({getHandlerFunction:()=> 'enviarAniversariosFenix'});}})},Logger:{log(){}},Date,UrlFetchApp:{fetch:(url,options)=>{sent.push(JSON.parse(options.payload));if(failAt===sent.length)throw new Error('network');return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({messages:[{id:'wamid.'+sent.length}]})};}}});
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}).slice(5);
 vm.runInContext(source,c);
 c.birthdayWriteChunks_('BIRTHDAY_ROSTER',[{id:'a',name:'Aluna teste',day,to:'5511999999999'}]);values.BIRTHDAY_ROSTER_UPDATED=new Date().toISOString();
 return {c,values,sent,triggers};
}
test('Daily run sends image to birthday student and approved studio number only once',()=>{const {c,sent}=setup();c.enviarAniversariosFenix();c.enviarAniversariosFenix();assert.equal(sent.length,2);assert.deepEqual(sent.map(x=>x.to),['5511999999999','5511940328780']);assert.equal(sent[0].template.components[0].parameters[0].image.link,'https://fenixdancas.github.io/estudio-fenix/assets/fe-aniversario.png');});
test('Pending template prevents every message and is reported as pending',()=>{const {c,sent,values}=setup({approved:false});c.enviarAniversariosFenix();assert.equal(sent.length,0);assert.match(values.BIRTHDAY_LAST_STATUS,/PENDING/);});
test('Unknown provider result does not retry or duplicate the studio copy',()=>{const {c,sent,values}=setup({failAt:1});c.enviarAniversariosFenix();c.enviarAniversariosFenix();assert.equal(sent.length,2);assert.ok(Object.values(values).some(v=>v==='{"status":"unknown"}'));});
test('Inactive students and missing data are excluded from the minimal roster',()=>{const {c}=setup();const rows=c.birthdayRoster_([{id:'a',nome:'A',status:'inativo',data_nascimento:'2000-10-09',telefone:'11999999999'},{id:'b',nome:'B',status:'ativo',data_nascimento:'2000-10-09',telefone:'11999999999',cpf:'secret'},{id:'c',nome:'C',status:'ativo',telefone:'11999999999'}]);assert.equal(rows.length,1);assert.equal(rows[0].day,'10-09');assert.equal(rows[0].cpf,undefined);assert.equal(rows[0].data_nascimento,undefined);});
test('Schedule setup is idempotent and creates one daily trigger',()=>{const {c,triggers}=setup();c.configurarAniversariosFenix();c.configurarAniversariosFenix();assert.equal(triggers.length,1);});
test('A shared studio recipient receives only one greeting when also the student',()=>{const {c,values,sent}=setup();const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}).slice(5);c.birthdayWriteChunks_('BIRTHDAY_ROSTER',[{id:'a',name:'A',day,to:'5511940328780'}]);c.enviarAniversariosFenix();assert.equal(sent.length,1);});
test('Non-administrators cannot refresh or inspect the birthday configuration',()=>{const {c}=setup();c.birthdayDb_=(p,path)=>path==='/auth/v1/user'?{id:'test'}:[{papel:'professora',status:'ativo'}];assert.throws(()=>c.birthdaySync_({access_token:'token'}),/administradoras/);assert.throws(()=>c.birthdayGetStatus_({access_token:'token'}),/administradoras/);});
