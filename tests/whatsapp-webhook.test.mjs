import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {createHandler,incomingEvents} from '../supabase/functions/whatsapp-webhook/handler.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const secret='synthetic-app-secret',token='synthetic-verify-token';
const fixture=()=>({object:'whatsapp_business_account',entry:[{id:'1260005122934753',changes:[{field:'messages',value:{metadata:{phone_number_id:'1360494423811214'},messages:[{id:'wamid.synthetic',from:'5511999999999',timestamp:'1790950000',type:'text',text:{body:'Confirmo'}}]}}]}]});
function setup(save=async()=>{}){return createHandler({env:n=>({META_APP_SECRET:secret,META_VERIFY_TOKEN:token})[n],save});}
function post(payload=fixture(),signature){const body=JSON.stringify(payload);return new Request('https://example.test/webhook',{method:'POST',body,headers:{'x-hub-signature-256':signature??'sha256='+createHmac('sha256',secret).update(body).digest('hex')}});}
test('Webhook verifies Meta challenge and refuses wrong token or missing configuration',async()=>{
 const h=setup();let r=await h(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token='+token+'&hub.challenge=123'));assert.equal(r.status,200);assert.equal(await r.text(),'123');assert.equal((await h(new Request('https://example.test/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'))).status,403);assert.equal((await createHandler({env:()=>undefined,save:async()=>{}})(post())).status,503);
});
test('Webhook accepts only signed messages and extracts a minimal incoming record',async()=>{
 let saved=[];const h=setup(async e=>saved=e);assert.equal((await h(post())).status,200);assert.equal(saved[0].content,'Confirmo');assert.equal(saved[0].event_key,'message:wamid.synthetic');assert.equal('payload' in saved[0],false);saved=[];assert.equal((await h(post(fixture(),'sha256='+'0'.repeat(64)))).status,403);assert.equal(saved.length,0);
});
test('Webhook acknowledges signed unrelated assets without storing them',async()=>{
 let calls=0;const h=setup(async()=>calls++);for(const field of ['account','phone']){const p=fixture();if(field==='account')p.entry[0].id='other';else p.entry[0].changes[0].value.metadata.phone_number_id='other';assert.equal((await h(post(p))).status,200);}assert.equal(calls,0);
});
test('Webhook keeps the real message in a signed batch containing unrelated assets',async()=>{
 const p=fixture(),other=fixture().entry[0];other.id='other';p.entry.unshift(other);
 const foreign=structuredClone(p.entry[1].changes[0]);foreign.value.metadata.phone_number_id='other';p.entry[1].changes.unshift(foreign);
 let saved=[];assert.equal((await setup(async e=>saved=e)(post(p))).status,200);assert.equal(saved.length,1);assert.equal(saved[0].message_id,'wamid.synthetic');
});
test('Webhook returns retryable failure if database write fails',async()=>{assert.equal((await setup(async()=>{throw new Error('offline');})(post())).status,503);});
test('Webhook uses stable duplicate keys and preserves delivery statuses separately',()=>{
 const p=fixture();const v=p.entry[0].changes[0].value;v.statuses=[{id:'wamid.synthetic',status:'read',timestamp:'1790950001'}];const a=incomingEvents(p),b=incomingEvents(p);assert.deepEqual(a,b);assert.equal(a[1].delivery_status,'read');assert.notEqual(a[0].event_key,a[1].event_key);
});
test('Webhook bounds body size and refuses unsupported methods',async()=>{
 const h=setup();assert.equal((await h(new Request('https://example.test/',{method:'POST',body:'x'.repeat(256*1024+1)}))).status,413);assert.equal((await h(new Request('https://example.test/',{method:'DELETE'}))).status,405);
});
