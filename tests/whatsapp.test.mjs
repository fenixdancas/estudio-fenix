import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../integrations/whatsapp-fixo.gs',import.meta.url),'utf8');
function backend(status='APPROVED',category='UTILITY',language='pt_BR'){
 const values={META_EXPERIMENTAL_REPLY_READY:'true',META_ACCESS_TOKEN:'synthetic-test-token',META_PHONE_NUMBER_ID:'1360494423811214',META_WABA_ID:'1260005122934753'};
 const context=vm.createContext({PROP:new Proxy({},{get:(_,key)=>key}),cfg_:key=>values[key]||'',graphVersion_:()=> 'v25.0',metaJson_:()=>({data:[{name:'fenix_confirmacao_experimental',status,category,language}]})});vm.runInContext(source,context);return {context,values};
}
const request={template:'fenix_confirmacao_experimental',template_params:JSON.stringify(['Maria','Ballet','15/10/2026','18:00'])};
test('Backend uses Meta configuration and normalizes national phone without duplicating country code',()=>{
 const {context:c,values}=backend();assert.equal(c.whatsappConfig_().url,'https://graph.facebook.com/v25.0');assert.equal(c.normalizePhone_('(11) 99999-9999'),'5511999999999');assert.equal(c.normalizePhone_('+55 11 2556-4328'),'551125564328');assert.equal(c.normalizePhone_('abc'),'');delete values.META_PHONE_NUMBER_ID;assert.throws(()=>c.whatsappConfig_(),/nao configurado/);
});
test('Backend permits approved Brazilian utility template with all four parameters',()=>{
 const {context:c}=backend();const p=c.whatsappPayload_(request,'5511999999999','test');assert.equal(p.type,'template');assert.equal(p.template.language.code,'pt_BR');assert.equal(p.template.components[0].parameters.length,4);
});
test('Backend blocks unapproved, marketing or different-language template before message submission',()=>{
 for(const [status,category,language] of [['PENDING','UTILITY','pt_BR'],['REJECTED','UTILITY','pt_BR'],['APPROVED','MARKETING','pt_BR'],['APPROVED','UTILITY','en_US']]){const {context:c}=backend(status,category,language);assert.throws(()=>c.whatsappPayload_(request,'5511999999999','test'),/Nenhuma mensagem foi enviada/);}
});
test('Backend blocks arbitrary template, malformed parameters and different account',()=>{
 const {context:c,values}=backend();assert.throws(()=>c.whatsappPayload_({...request,template:'other'},'5511999999999','test'),/nao permitido/);assert.throws(()=>c.whatsappPayload_({...request,template_params:'[]'},'5511999999999','test'),/quatro parametros/);values.META_WABA_ID='other';assert.throws(()=>c.whatsappPayload_(request,'5511999999999','test'),/divergente/);
});

test('Backend keeps experimental sends blocked until response processing is enabled',()=>{const {context:c,values}=backend();values.META_EXPERIMENTAL_REPLY_READY='';assert.throws(()=>c.whatsappPayload_(request,'5511999999999','test'),/recebimento das respostas/);});

function cardBackend({status='APPROVED',header=true,code=200,mediaId='123456'}={}){
 const t=backend(status);const uploads=[];
 t.context.metaJson_=()=>({data:[{name:'fenix_confirmacao_experimental_card',status,category:'UTILITY',language:'pt_BR',components:header?[{type:'HEADER',format:'IMAGE'}]:[]}]});
 t.context.Utilities={base64Decode:v=>[...Buffer.from(v,'base64')],newBlob:(bytes,type,name)=>({bytes,type,name})};
 t.context.UrlFetchApp={fetch:(url,options)=>{uploads.push({url,options});return {getResponseCode:()=>code,getContentText:()=>JSON.stringify({id:mediaId})}}};
 return {...t,uploads};
}
const cardRequest={...request,template:'fenix_confirmacao_experimental_card',card_base64:Buffer.from([255,216,255,217]).toString('base64')};
test('Experimental card uploads privately and supplies its media id in the template header',()=>{
 const {context:c,uploads}=cardBackend();const payload=c.whatsappPayload_(cardRequest,'5511999999999','test');
 assert.equal(uploads.length,1);assert.equal(uploads[0].url,'https://graph.facebook.com/v25.0/1360494423811214/media');
 assert.equal(uploads[0].options.payload.file.type,'image/jpeg');
 assert.equal(payload.template.components[0].parameters[0].image.id,'123456');assert.equal(payload.template.components[1].parameters.length,4);
});
test('Pending or text-only templates and invalid JPEGs never upload or fall back to text',()=>{
 for(const options of [{status:'PENDING'},{header:false},{}]){
  const {context:c,uploads}=cardBackend(options);
  assert.throws(()=>c.whatsappPayload_(options.status||options.header===false?cardRequest:{...cardRequest,card_base64:'not-an-image'},'5511999999999','test'));
  assert.equal(uploads.length,0);
 }
});
test('Media rejection or unknown response prevents creating a message payload',()=>{
 for(const options of [{code:400},{mediaId:''}]){
  const {context:c}=cardBackend(options);assert.throws(()=>c.whatsappPayload_(cardRequest,'5511999999999','test'),/Nenhuma mensagem foi enviada/);
 }
});
test('Experimental card refuses a different source number',()=>{
 const {context:c,values,uploads}=cardBackend();values.META_PHONE_NUMBER_ID='other';assert.throws(()=>c.whatsappPayload_(cardRequest,'5511999999999','test'),/divergente/);assert.equal(uploads.length,0);
});
