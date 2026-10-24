// Roteamento dos modelos aprovados; usa as credenciais existentes somente no servidor.
const FENIX_CARD_CURTO = 'fenix_confirmacao_experimental_card_curto';
const FENIX_COBRANCAS = Object.freeze({
 fenix_mensalidade_amanha:'fe-mensalidade-amanha.jpg',
 fenix_mensalidade_hoje:'fe-mensalidade-hoje.jpg',
 fenix_mensalidade_aberta:'fe-mensalidade-aberta.jpg'
});
function modeloImagemAprovado_(name){
 if(cfg_(PROP.META_WABA_ID)!=='1260005122934753'||cfg_(PROP.META_PHONE_NUMBER_ID)!=='1360494423811214')throw new Error('Conta divergente.');
 const r=metaJson_('1260005122934753/message_templates?name='+encodeURIComponent(name)+'&fields=name,status,category,language,components');
 const t=(r.data||[]).find(function(t){return t.name===name&&t.language==='pt_BR';});
 if(!t||t.status!=='APPROVED'||t.category!=='UTILITY'||!(t.components||[]).some(function(c){return c.type==='HEADER'&&c.format==='IMAGE';}))throw new Error('Modelo indisponivel. Nenhuma mensagem foi enviada.');
 return t;
}
function imagemCardPrivada_(base64){
 if(typeof base64!=='string'||base64.length>2800000||! /^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('Card JPEG invalido.');
 const bytes=Utilities.base64Decode(base64);
 if(bytes.length<1000||bytes.length>2000000||(bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[2]&255)!==255)throw new Error('Card JPEG invalido.');
 const c=whatsappConfig_();
 const r=UrlFetchApp.fetch(c.url.replace(/\/+$/,'')+'/'+c.phoneId+'/media',{method:'post',headers:{Authorization:'Bearer '+c.token},payload:{messaging_product:'whatsapp',type:'image/jpeg',file:Utilities.newBlob(bytes,'image/jpeg','aula-experimental.jpg')},muteHttpExceptions:true});
 let media;try{media=JSON.parse(r.getContentText());}catch(_){throw new Error('Falha ao carregar card.');}
 if(r.getResponseCode()<200||r.getResponseCode()>=300||!/^\d+$/.test(String(media.id||'')))throw new Error('Imagem nao aceita. Nenhuma mensagem foi enviada.');
 return {id:String(media.id)};
}
function payloadModeloImagem_(name,to,image,values){
 const components=[{type:'header',parameters:[{type:'image',image:image}]}];
 if(values.length)components.push({type:'body',parameters:values.map(function(v){return {type:'text',text:String(v).replace(/\s+/g,' ').trim()};})});
 return {messaging_product:'whatsapp',recipient_type:'individual',to:to,type:'template',template:{name:name,language:{code:'pt_BR'},components:components}};
}
function faseMensalidade_(f,aluna,today){
 if(!f||f.tipo!=='mensalidade'||f.status!=='em_aberto'||f.pago_em||!(Number(f.valor)>0)||!aluna||aluna.status!=='ativo'||(aluna.dados_fenix||{}).matriculaExcluidaEm)return '';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimento||'')||!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return '';
 const days=(Date.parse(today+'T12:00:00Z')-Date.parse(f.vencimento+'T12:00:00Z'))/86400000;
 return days===-1?'fenix_mensalidade_amanha':days===0?'fenix_mensalidade_hoje':days===3?'fenix_mensalidade_aberta':'';
}
function dadosCobrancaAtuais_(p,to){
 birthdayAdmin_(p);
 if(!/^[0-9a-f-]{36}$/i.test(String(p.financeiro_id||'')))throw new Error('Mensalidade sem identificador valido.');
 const rows=birthdayDb_(p,'/rest/v1/financeiro?select=id,aluna_id,tipo,valor,vencimento,status,pago_em,descricao,dados_fenix&id=eq.'+encodeURIComponent(p.financeiro_id));
 if(rows.length!==1)throw new Error('Mensalidade indisponivel.');
 const f=rows[0];if(!f.aluna_id)throw new Error('Mensalidade sem aluna.');
 const students=birthdayDb_(p,'/rest/v1/alunas?select=id,nome,telefone,status,dados_fenix&id=eq.'+encodeURIComponent(f.aluna_id));
 const s=students[0],today=Utilities.formatDate(new Date(),'America/Sao_Paulo','yyyy-MM-dd');
 if(!s||normalizePhone_(s.telefone)!==to||faseMensalidade_(f,s,today)!==p.template)throw new Error('Envio bloqueado: pagamento, destino ou vencimento mudou.');
 const name=(String((s.dados_fenix||{}).apelido||'').trim()||String(s.nome||'').trim().split(/\s+/)[0]).replace(/\s+/g,' ').trim();
 if(!name)throw new Error('Nome indisponivel.');
 const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const d=f.vencimento.split('-');
 return {id:f.id,values:[name,months[Number(d[1])-1]+' de '+d[0],d.reverse().join('/')]};
}
function whatsappPayloadAprovado_(p,to,message){
 if(p.template===FENIX_CARD_CURTO){
  if(cfg_('META_EXPERIMENTAL_REPLY_READY')!=='true')throw new Error('Recebimento de respostas indisponivel.');
  modeloImagemAprovado_(p.template);
  return payloadModeloImagem_(p.template,to,imagemCardPrivada_(p.card_base64),[]);
 }
 if(Object.prototype.hasOwnProperty.call(FENIX_COBRANCAS,p.template)){
  const data=dadosCobrancaAtuais_(p,to);modeloImagemAprovado_(p.template);
  return payloadModeloImagem_(p.template,to,{link:'https://fenixdancas.github.io/estudio-fenix/assets/'+FENIX_COBRANCAS[p.template]},data.values);
 }
 return whatsappPayload_(p,to,message);
}
