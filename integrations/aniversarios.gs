// Aniversários Fênix: roster mínimo, execução diária e uma tentativa por destino/dia.
// Não armazena tokens Supabase. As atualizações vêm do banco com sessão de administradora.
const FENIX_BIRTHDAY = Object.freeze({
  template: 'fenix_aniversario', language: 'pt_BR',
  image: 'https://fenixdancas.github.io/estudio-fenix/assets/fe-aniversario.png',
  copy: '5511940328780', timezone: 'America/Sao_Paulo', hour: 10
});

function birthdayDb_(p, path) {
  const token=String(p.access_token||'').trim();
  const base=cfg_(PROP.SUPABASE_URL).replace(/\/+$/,'');
  const key=String(p.supabase_key||cfg_(PROP.SUPABASE_PUBLISHABLE_KEY)).trim();
  if(!token||!base||!key)throw new Error('Sessão de administradora obrigatória.');
  const r=UrlFetchApp.fetch(base+path,{headers:{apikey:key,Authorization:'Bearer '+token},muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw new Error('Não foi possível conferir os dados atuais no banco.');
  return JSON.parse(r.getContentText());
}
function birthdayAdmin_(p) {
  const user=birthdayDb_(p,'/auth/v1/user');
  const rows=birthdayDb_(p,'/rest/v1/perfis?select=papel,status&id=eq.'+encodeURIComponent(user.id));
  if(rows.length!==1||rows[0].papel!=='admin'||rows[0].status!=='ativo')throw new Error('Acesso restrito às administradoras.');
}
function birthdayRoster_(rows) {
  return rows.filter(function(r){return r.status==='ativo'&&/^\d{4}-\d{2}-\d{2}$/.test(r.data_nascimento||'')&&normalizePhone_(r.telefone);})
    .map(function(r){return {id:String(r.id),name:String(r.nome||'').slice(0,120),day:r.data_nascimento.slice(5),to:normalizePhone_(r.telefone)};});
}
function birthdayWriteChunks_(key,data) {
  const value=JSON.stringify(data), props=props_(), count=Math.ceil(value.length/2000), old=Number(props.getProperty(key+'_count')||0);
  for(let i=0;i<count;i++)props.setProperty(key+'_'+i,value.slice(i*2000,(i+1)*2000));
  props.setProperty(key+'_count',String(count));
  for(let i=count;i<old;i++)props.deleteProperty(key+'_'+i);
}
function birthdayReadChunks_(key) {
  const props=props_(), count=Number(props.getProperty(key+'_count')||0);
  if(!count)return [];
  let value='';for(let i=0;i<count;i++)value+=props.getProperty(key+'_'+i)||'';
  return JSON.parse(value);
}
function birthdayTemplate_() {
  const waba=cfg_(PROP.META_WABA_ID);
  if(waba!=='1260005122934753')throw new Error('Conta WhatsApp divergente.');
  const r=metaJson_(waba+'/message_templates?name='+FENIX_BIRTHDAY.template+'&fields=name,status,language,components');
  const t=(r.data||[]).find(function(x){return x.name===FENIX_BIRTHDAY.template&&x.language===FENIX_BIRTHDAY.language;});
  const image=t&&(t.components||[]).some(function(c){return c.type==='HEADER'&&c.format==='IMAGE';});
  return {approved:!!t&&t.status==='APPROVED'&&image,status:t?t.status:'NOT_CREATED'};
}
function birthdayStatus_() {
  const props=props_(), triggers=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='enviarAniversariosFenix';});
  return {scheduled:triggers.length>0,copy:FENIX_BIRTHDAY.copy,hour:FENIX_BIRTHDAY.hour,timezone:FENIX_BIRTHDAY.timezone,
    roster_updated:props.getProperty('BIRTHDAY_ROSTER_UPDATED'),registered:birthdayReadChunks_('BIRTHDAY_ROSTER').length,
    last_run:props.getProperty('BIRTHDAY_LAST_RUN'),last_status:props.getProperty('BIRTHDAY_LAST_STATUS'),template:birthdayTemplate_()};
}
function birthdaySync_(p) {
  birthdayAdmin_(p);
  const all=[];let offset=0;
  while(true){
    const page=birthdayDb_(p,'/rest/v1/alunas?select=id,nome,telefone,data_nascimento,status&order=id&limit=500&offset='+offset);
    all.push.apply(all,page);if(page.length<500)break;offset+=500;if(offset>10000)throw new Error('Cadastro excede o limite da rotina.');
  }
  const roster=birthdayRoster_(all), lock=LockService.getScriptLock();lock.waitLock(20000);
  try{birthdayWriteChunks_('BIRTHDAY_ROSTER',roster);props_().setProperty('BIRTHDAY_ROSTER_UPDATED',new Date().toISOString());}
  finally{lock.releaseLock();}
  return ok_({registered:roster.length,roster_updated:props_().getProperty('BIRTHDAY_ROSTER_UPDATED')});
}
function birthdayGetStatus_(p){birthdayAdmin_(p);return ok_(birthdayStatus_());}
function configurarAniversariosFenix() {
  if(!birthdayReadChunks_('BIRTHDAY_ROSTER').length)throw new Error('Sincronize primeiro as datas no Sistema Fênix.');
  const matches=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='enviarAniversariosFenix';});
  if(!matches.length)ScriptApp.newTrigger('enviarAniversariosFenix').timeBased().everyDays(1).atHour(FENIX_BIRTHDAY.hour).inTimezone(FENIX_BIRTHDAY.timezone).create();
  Logger.log(JSON.stringify(birthdayStatus_()));
}
function birthdayPayload_(student,to) {
  return {messaging_product:'whatsapp',recipient_type:'individual',to:to,type:'template',template:{name:FENIX_BIRTHDAY.template,language:{code:FENIX_BIRTHDAY.language},components:[
    {type:'header',parameters:[{type:'image',image:{link:FENIX_BIRTHDAY.image}}]},
    {type:'body',parameters:[{type:'text',text:student.name}]}
  ]}};
}
function birthdaySend_(student,to,date,kind) {
  const props=props_(), key='BDAY_'+date+'_'+student.id+'_'+kind;
  if(props.getProperty(key))return {status:'already_attempted'};
  const c=whatsappConfig_();
  if(c.phoneId!=='1360494423811214')throw new Error('Número de origem divergente.');
  if(to==='551125564328')throw new Error('O destino não pode ser o número de origem.');
  props.setProperty(key,JSON.stringify({status:'attempting',at:new Date().toISOString()}));
  try{
    const r=UrlFetchApp.fetch(c.url.replace(/\/+$/,'')+'/'+c.phoneId+'/messages',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+c.token},payload:JSON.stringify(birthdayPayload_(student,to)),muteHttpExceptions:true});
    const data=JSON.parse(r.getContentText()||'{}'), code=r.getResponseCode(), id=data.messages&&data.messages[0]&&data.messages[0].id;
    const result=code>=200&&code<300&&id?{status:'accepted',id:id}:{status:'rejected',code:data.error&&data.error.code||code};
    props.setProperty(key,JSON.stringify(result));return result;
  }catch(_){const result={status:'unknown'};props.setProperty(key,JSON.stringify(result));return result;}
}
function enviarAniversariosFenix() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    const now=new Date(), date=Utilities.formatDate(now,FENIX_BIRTHDAY.timezone,'yyyy-MM-dd'), props=props_();
    props.setProperty('BIRTHDAY_LAST_RUN',now.toISOString());
    const template=birthdayTemplate_();
    if(!template.approved){props.setProperty('BIRTHDAY_LAST_STATUS','Modelo aguardando aprovação: '+template.status);return;}
    const roster=birthdayReadChunks_('BIRTHDAY_ROSTER');
    if(!props.getProperty('BIRTHDAY_ROSTER_UPDATED'))throw new Error('Datas ainda não sincronizadas.');
    let accepted=0,rejected=0,unknown=0;
    roster.filter(function(s){return s.day===date.slice(5);}).forEach(function(s){
      const destinations=[{to:s.to,kind:'student'}];if(s.to!==FENIX_BIRTHDAY.copy)destinations.push({to:FENIX_BIRTHDAY.copy,kind:'copy'});
      destinations.forEach(function(d){const r=birthdaySend_(s,d.to,date,d.kind);if(r.status==='accepted')accepted++;if(r.status==='rejected')rejected++;if(r.status==='unknown')unknown++;});
    });
    props.setProperty('BIRTHDAY_LAST_STATUS','Aceitos: '+accepted+'; recusados: '+rejected+'; verificar: '+unknown);
    const cutoff=Utilities.formatDate(new Date(now.getTime()-35*86400000),FENIX_BIRTHDAY.timezone,'yyyy-MM-dd');
    Object.keys(props.getProperties()).filter(function(k){return k.startsWith('BDAY_')&&k.slice(5,15)<cutoff;}).forEach(function(k){props.deleteProperty(k);});
  }catch(_){props_().setProperty('BIRTHDAY_LAST_STATUS','Falha na rotina. Confira a configuração antes de reenviar.');throw new Error('Falha na rotina de aniversários.');}
  finally{lock.releaseLock();}
}
// Teste explícito: destinatário informado pela usuária; não consulta aniversariantes.
function testarAniversarioNahidFenix(){const t=birthdayTemplate_();if(!t.approved)throw new Error('Modelo ainda não aprovado.');Logger.log(JSON.stringify(birthdaySend_({id:'test-nahid',name:'Nahid'},'5511985791729',Utilities.formatDate(new Date(),FENIX_BIRTHDAY.timezone,'yyyy-MM-dd'),'test')));}
function testarAniversarioCopiaFenix(){const t=birthdayTemplate_();if(!t.approved)throw new Error('Modelo ainda não aprovado.');Logger.log(JSON.stringify(birthdaySend_({id:'test-copy',name:'Nahid'},FENIX_BIRTHDAY.copy,Utilities.formatDate(new Date(),FENIX_BIRTHDAY.timezone,'yyyy-MM-dd'),'test')));}
