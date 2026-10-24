import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../integrations/modelos-aprovados.gs',import.meta.url),'utf8');
function harness(){
 const f={id:'11111111-1111-1111-1111-111111111111',aluna_id:'22222222-2222-2222-2222-222222222222',tipo:'mensalidade',status:'em_aberto',pago_em:null,valor:100,vencimento:'2026-10-24'};
 const s={nome:'Aluna Teste',telefone:'5511999999999',status:'ativo',dados_fenix:{apelido:'Teste'}};
 let admin=true,approved=true,uploads=0;
 const c=vm.createContext({PROP:new Proxy({},{get:(_,k)=>k}),cfg_:k=>({META_WABA_ID:'1260005122934753',META_PHONE_NUMBER_ID:'1360494423811214',META_EXPERIMENTAL_REPLY_READY:'true'})[k],
 metaJson_:url=>({data:[{name:new URLSearchParams(url.split('?')[1]).get('name'),language:'pt_BR',status:approved?'APPROVED':'PENDING',category:'UTILITY',components:[{type:'HEADER',format:'IMAGE'}]}]}),
 birthdayAdmin_:()=>{if(!admin)throw Error('admin');},birthdayDb_:(_,path)=>path.includes('/financeiro')?[f]:[s],normalizePhone_:v=>v,Utilities:{formatDate:()=> '2026-10-24',base64Decode:()=>[255,216,255,...Array(1100).fill(0)],newBlob:()=>({})},
 whatsappConfig_:()=>({url:'https://graph.facebook.com/v25.0',phoneId:'1360494423811214',token:'synthetic'}),UrlFetchApp:{fetch:()=>{uploads++;return {getResponseCode:()=>200,getContentText:()=>'{"id":"123"}'};}},whatsappPayload_:()=>({legacy:true})});
 vm.runInContext(source,c);return {c,f,s,setAdmin:v=>admin=v,setApproved:v=>approved=v,uploads:()=>uploads};
}
test('Short confirmation includes only image parameters, without repeated class fields',()=>{const t=harness();const p=t.c.whatsappPayloadAprovado_({template:'fenix_confirmacao_experimental_card_curto',card_base64:'AAAA'},'5511999999999','test');assert.equal(p.template.components.length,1);assert.equal(p.template.components[0].parameters[0].image.id,'123');});
test('Pending short model never uploads a card',()=>{const t=harness();t.setApproved(false);assert.throws(()=>t.c.whatsappPayloadAprovado_({template:'fenix_confirmacao_experimental_card_curto',card_base64:'AAAA'},'5511999999999','test'));assert.equal(t.uploads(),0);});
test('Billing reads current payment and identity instead of trusting client values',()=>{const t=harness();const p=t.c.whatsappPayloadAprovado_({template:'fenix_mensalidade_hoje',financeiro_id:t.f.id,template_params:'["Wrong"]'},t.s.telefone,'test');assert.equal(p.template.components[1].parameters[0].text,'Teste');assert.equal(p.template.components[1].parameters[2].text,'24/10/2026');});
test('Paid, cancelled, negotiated, zero value, deleted and inactive rows cannot be billed',()=>{for(const change of [{status:'pago'},{status:'cancelado'},{status:'negociado'},{pago_em:'2026-10-24'},{valor:0},{tipo:'entrada'}]){const t=harness();Object.assign(t.f,change);assert.equal(t.c.faseMensalidade_(t.f,t.s,'2026-10-24'),'');}for(const change of [{status:'inativo'},{dados_fenix:{matriculaExcluidaEm:'2026-10-23'}}]){const t=harness();Object.assign(t.s,change);assert.equal(t.c.faseMensalidade_(t.f,t.s,'2026-10-24'),'');}});
test('Only eve, due day and third day overdue qualify, including month boundary',()=>{const t=harness();t.f.vencimento='2026-10-31';for(const [date,expected] of [['2026-10-30','amanha'],['2026-10-31','hoje'],['2026-11-03','aberta']])assert.equal(t.c.faseMensalidade_(t.f,t.s,date),'fenix_mensalidade_'+expected);assert.equal(t.c.faseMensalidade_(t.f,t.s,'2026-11-04'),'');});
test('Wrong recipient, wrong phase and non-admin are refused',()=>{const t=harness();const p={template:'fenix_mensalidade_amanha',financeiro_id:t.f.id};assert.throws(()=>t.c.whatsappPayloadAprovado_(p,t.s.telefone,'test'));p.template='fenix_mensalidade_hoje';assert.throws(()=>t.c.whatsappPayloadAprovado_(p,'5511888888888','test'));t.setAdmin(false);assert.throws(()=>t.c.whatsappPayloadAprovado_(p,t.s.telefone,'test'));});
