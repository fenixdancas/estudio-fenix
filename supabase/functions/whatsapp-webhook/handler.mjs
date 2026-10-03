// No credentials in source. Meta signs the original request bytes.
const encoder = new TextEncoder();
const PHONE = '1360494423811214';
const WABA = '1260005122934753';
const LIMIT = 256 * 1024;
export async function verifySignature(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',key,bytes,raw);
}
async function readBounded(request) {
  const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
  const chunks=[];let size=0;
  for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw new RangeError('large');}chunks.push(value);}
  const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}return raw;
}
export function incomingEvents(payload) {
  if(payload?.object!=='whatsapp_business_account') throw new Error('object');
  const events=[];
  for(const entry of payload.entry || []) {
    // A signed batch may contain dashboard fixtures or other subscribed assets.
    // Acknowledge ignored assets so Meta does not keep retrying them.
    if(String(entry.id)!==WABA) continue;
    for(const change of entry.changes || []) {
      if(change.field!=='messages') continue;
      const value=change.value;
      if(String(value?.metadata?.phone_number_id)!==PHONE) continue;
      for(const m of value.messages || []) {
        if(!m.id || !/^\d{8,15}$/.test(m.from || '') || !/^\d+$/.test(m.timestamp || '')) throw new Error('message');
        const text=m.type==='text'?m.text?.body:m.type==='button'?m.button?.text:m.type==='interactive'?(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title):null;
        events.push({event_key:'message:'+m.id,message_id:m.id,kind:'message',phone:m.from,occurred_at:new Date(Number(m.timestamp)*1000).toISOString(),content:typeof text==='string'?text.slice(0,8192):null,message_type:String(m.type || 'unknown'),delivery_status:null});
      }
      for(const s of value.statuses || []) {
        if(!s.id || !['sent','delivered','read','failed'].includes(s.status) || !/^\d+$/.test(s.timestamp || '')) throw new Error('status');
        events.push({event_key:'status:'+s.id+':'+s.status+':'+s.timestamp,message_id:s.id,kind:'status',phone:null,occurred_at:new Date(Number(s.timestamp)*1000).toISOString(),content:null,message_type:null,delivery_status:s.status});
      }
    }
  }
  return events;
}
export function createHandler({env,save}) {
  return async request=>{
    const secret=env('META_APP_SECRET'), token=env('META_VERIFY_TOKEN');
    if(!secret || !token) return new Response('Not configured',{status:503});
    if(request.method==='GET') {
      const p=new URL(request.url).searchParams;
      if(p.get('hub.mode')!=='subscribe' || p.get('hub.verify_token')!==token || !/^\d{1,100}$/.test(p.get('hub.challenge') || '')) return new Response('Forbidden',{status:403});
      return new Response(p.get('hub.challenge'),{headers:{'Content-Type':'text/plain'}});
    }
    if(request.method!=='POST') return new Response('Method not allowed',{status:405});
    let raw;
    try{raw=await readBounded(request);}catch{return new Response('Too large',{status:413});}
    if(!await verifySignature(raw,request.headers.get('x-hub-signature-256'),secret)) return new Response('Forbidden',{status:403});
    let events;try{events=incomingEvents(JSON.parse(new TextDecoder().decode(raw)));}catch{return new Response('Invalid event',{status:400});}
    try{if(events.length)await save(events);}catch{return new Response('Storage unavailable',{status:503});}
    return new Response('EVENT_RECEIVED',{status:200});
  };
}
