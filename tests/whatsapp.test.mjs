import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../integrations/whatsapp-fixo.gs',import.meta.url),'utf8');
function backend(status='APPROVED',category='UTILITY',language='pt_BR'){
 const values={META_ACCESS_TOKEN:'synthetic-test-token',META_PHONE_NUMBER_ID:'1360494423811214',META_WABA_ID:'1260005122934753',META_EXPERIMENTAL_REPLY_READY:'true'};
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

test('Backend blocks experimental template until incoming replies are validated',()=>{
 const {context:c,values}=backend();for(const value of ['', 'false', 'TRUE']){values.META_EXPERIMENTAL_REPLY_READY=value;assert.throws(()=>c.whatsappPayload_(request,'5511999999999','test'),/recebimento das respostas/);}
});
