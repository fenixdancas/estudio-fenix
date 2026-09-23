import {chromium} from 'playwright';import bundled from '@sparticuz/chromium';import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';import {fixtures,fakeClient,ids} from './harness.mjs';
const root=path.resolve(import.meta.dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const b=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':'text/html');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const executable=process.env.CHROMIUM_PATH||(fs.existsSync('/tmp/chromium')?'/tmp/chromium':await bundled.executablePath());
const browser=await chromium.launch({executablePath:executable,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
const results=[];fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
try{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.fulfill({status:200,contentType:'text/javascript',body:''}));
  const tables=fixtures();tables.perfis=[{id:'admin-test',nome:'Admin teste',papel:'admin',status:'ativo',professora_id:null}];
  await page.addInitScript(({tables,fake})=>{window.alerts=[];window.alert=x=>window.alerts.push(x);window.confirm=()=>true;const factory=(0,eval)('('+fake+')');const client=factory(tables);client.auth.signInWithPassword=async()=>({data:{user:{id:'admin-test',email:'admin@example.test'}}});window.testClient=client;window.supabase={createClient:()=>client};},{tables,fake:fakeClient.toString().replaceAll('webcrypto','crypto')});
  await page.goto(base);await page.locator('#loginPass').fill('synthetic-password');await page.locator('#loginEnter').click();await page.locator('#app').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);assert.equal(await page.locator('#saveStatus').innerText(),'Dados carregados');
  for(const view of ['alunos','professores','turmas','presenca','mensalidades','contas','financeiro','eventos','aniversarios','busca','historico','config']){await page.locator(`button[data-view="${view}"]`).click();assert(await page.locator('#page h1').isVisible());}
  await page.locator('button[data-view="eventos"]').click();await page.getByRole('button',{name:'＋ Novo evento'}).click();await page.locator('#eventForm [name="nome"]').fill('Espetáculo de teste');await page.locator('#eventForm [name="data"]').fill('2026-10-10');await page.getByRole('button',{name:'Salvar evento',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});assert(await page.getByText('Espetáculo de teste',{exact:true}).isVisible());
  await page.locator('button[data-view="aniversarios"]').click();await page.getByRole('button',{name:'＋ Nova data comemorativa'}).click();await page.locator('#commForm [name="nome"]').fill('Dia da dança');await page.locator('#commForm [name="data"]').fill('2026-10-11');await page.getByRole('button',{name:'Salvar data',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
  await page.locator('button[data-view="presenca"]').click();await page.getByRole('button',{name:'＋ Registrar presença'}).click();await page.locator('#attForm select[name^="status_"]').selectOption('Falta justificada');await page.getByRole('button',{name:'Salvar presença',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
  await page.locator('button[data-view="alunos"]').click();await page.getByRole('button',{name:'Abrir ficha',exact:true}).first().click();await page.locator('#studentForm [name="mensalidade"]').fill('500');await page.locator('#studentForm [name="nome"]').fill('Aluna A');await page.locator('#studentForm [name="nasc"]').fill('2000-01-01');await page.locator('#studentForm [name="fone"]').fill('11900000000');await page.getByRole('button',{name:'Salvar matrícula',exact:true}).click();await page.getByText('Contrato de prestação de serviço',{exact:true}).waitFor();await page.getByRole('button',{name:'Fechar',exact:true}).click();assert(await page.getByText('R$ 500,00',{exact:true}).isVisible());
  // Independent reload: persisted mocked database is retained in test context, no app cache shortcuts.
  await page.evaluate(async()=>{await loadSupabaseDb();go('alunos');});assert(await page.getByText('R$ 500,00',{exact:true}).isVisible());
  await page.screenshot({path:path.join(root,`test-results/alunas-${viewport.width}.png`),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'No page-wide horizontal overflow');
  await page.locator('#logoutBtn').click();await page.locator('#loginScreen').waitFor({state:'visible'});await page.screenshot({path:path.join(root,`test-results/login-${viewport.width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);results.push({viewport,passed:true,flows:['login','13 views','event','commemorative','attendance','enrollment','reload','logout'],pageErrors:errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));fs.writeFileSync(path.join(root,'test-results/browser.json'),JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
