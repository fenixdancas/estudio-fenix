import { createHandler } from './handler.mjs';
Deno.serve(createHandler({
  env: (name: string) => Deno.env.get(name),
  save: async (events: unknown[]) => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Storage configuration missing');
    const res = await fetch(url + '/rest/v1/whatsapp_eventos?on_conflict=event_key', {
      method: 'POST',
      headers: {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
      body: JSON.stringify(events),
    });
    if (!res.ok) throw new Error('Storage failed');
  },
}));
