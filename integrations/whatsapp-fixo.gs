// Funcoes aplicadas ao projeto Apps Script Fenix em 02/10/2026.
// Dependem de PROP, cfg_, graphVersion_ e metaJson_ do backend existente.
// sendWhatsApp_ usa JSON.stringify(whatsappPayload_(p, to, message)) no payload.
// Nenhuma chave, PIN ou dado de aluna e armazenado neste arquivo.
function whatsappConfig_() {
  const metaToken = cfg_(PROP.META_ACCESS_TOKEN);
  const metaPhoneId = cfg_(PROP.META_PHONE_NUMBER_ID);
  const useMeta = !!metaToken && !!metaPhoneId;
  const url = useMeta ? "https://graph.facebook.com/" + graphVersion_() : cfg_(PROP.WHATSAPP_API_URL);
  const token = useMeta ? metaToken : cfg_(PROP.WHATSAPP_ACCESS_TOKEN);
  const phoneId = useMeta ? metaPhoneId : cfg_(PROP.WHATSAPP_PHONE_NUMBER_ID);
  if (!url || !token || !phoneId) throw new Error("WhatsApp nao configurado nas propriedades do Apps Script.");
  return {url: url, token: token, phoneId: phoneId, businessNumber: cfg_(PROP.FENIX_WHATSAPP_NUMBER)};
}
function normalizePhone_(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (/^[1-9]\d{7,14}$/.test(digits)) return digits;
  return "";
}
function whatsappPayload_(p, to, message) {
  const base = {messaging_product: "whatsapp", recipient_type: "individual", to: to};
  if (!p.template) return Object.assign(base, {type: "text", text: {preview_url: false, body: message}});
  if (cfg_("META_EXPERIMENTAL_REPLY_READY") !== "true") throw new Error("O recebimento das respostas ainda esta em configuracao. Nenhuma mensagem foi enviada.");
  const withCard = p.template === "fenix_confirmacao_experimental_card";
  if (p.template !== "fenix_confirmacao_experimental" && !withCard) throw new Error("Modelo de WhatsApp nao permitido.");
  let values;
  try { values = JSON.parse(String(p.template_params || "[]")); }
  catch (_) { throw new Error("Parametros do modelo invalidos."); }
  if (!Array.isArray(values) || values.length !== 4 || values.some(function(v) { return typeof v !== "string" || !v.trim() || v.length > 1024 || /[\r\n\t]/.test(v); })) throw new Error("Informe os quatro parametros validos da aula experimental.");
  const waba = cfg_(PROP.META_WABA_ID);
  if (waba !== "1260005122934753") throw new Error("Conta WhatsApp divergente: envio bloqueado.");
  const result = metaJson_(encodeURIComponent(waba) + "/message_templates?name=" + encodeURIComponent(p.template) + "&fields=name,status,category,language,components");
  const approved = (result.data || []).find(function(t) { return t.name === p.template && t.language === "pt_BR" && t.status === "APPROVED" && t.category === "UTILITY"; });
  if (!approved) throw new Error("A Meta ainda nao aprovou este modelo como Utilidade. Nenhuma mensagem foi enviada.");
  const components = [{type: "body", parameters: values.map(function(v) { return {type: "text", text: v.trim()}; })}];
  if (withCard) {
    if (!(approved.components || []).some(function(c) { return c.type === "HEADER" && c.format === "IMAGE"; })) throw new Error("O modelo aprovado nao possui cabecalho de imagem. Nenhuma mensagem foi enviada.");
    const mediaId = experimentalCardUpload_(p.card_base64);
    components.unshift({type: "header", parameters: [{type: "image", image: {id: mediaId}}]});
  } else if (p.card_base64) {
    throw new Error("O card exige o modelo com imagem. Nenhuma mensagem foi enviada.");
  }
  return Object.assign(base, {type: "template", template: {name: p.template, language: {code: "pt_BR"}, components: components}});
}
// Diagnostico somente leitura: nunca chama /messages nem /register.
function validarIntegracaoWhatsAppFenix() {
  const c = whatsappConfig_();
  if (c.phoneId !== "1360494423811214") throw new Error("Numero de origem divergente.");
  if (normalizePhone_("(11) 99999-9999") !== "5511999999999" || normalizePhone_("+55 11 2556-4328") !== "551125564328") throw new Error("Falha na normalizacao de telefone.");
  const phone = metaJson_(encodeURIComponent(c.phoneId) + "?fields=display_phone_number,status,code_verification_status");
  const templates = metaJson_(encodeURIComponent(cfg_(PROP.META_WABA_ID)) + "/message_templates?name=fenix_confirmacao_experimental&fields=name,status,category,language");
  Logger.log(JSON.stringify({configuracao: "Meta", telefone: phone.display_phone_number, status: phone.status, verificacao: phone.code_verification_status, modelos: (templates.data || []).filter(function(t) { return t.name === "fenix_confirmacao_experimental"; }), normalizacao: "OK", mensagensEnviadas: 0}));
}

// Habilitar somente apos aplicar 202610160001 e publicar whatsapp-webhook.
function habilitarRespostasExperimentaisFenix() {
 if (cfg_(PROP.META_PHONE_NUMBER_ID) !== "1360494423811214" || cfg_(PROP.META_WABA_ID) !== "1260005122934753") throw new Error("Conta divergente.");
 props_().setProperty("META_EXPERIMENTAL_REPLY_READY", "true");
 Logger.log(JSON.stringify({respostasExperimentais:"habilitadas",mensagensEnviadas:0}));
}

// Chamado somente depois de validar conta, parametros e aprovacao do modelo.
// O JPEG fica na Meta; nao e publicado no Drive ou no GitHub.
function experimentalCardUpload_(encoded) {
  if (typeof encoded !== "string" || !encoded || encoded.length > 6990508 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Card JPEG invalido. Nenhuma mensagem foi enviada.");
  const bytes = Utilities.base64Decode(encoded);
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 4 || (bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216 || (bytes[bytes.length-2] & 255) !== 255 || (bytes[bytes.length-1] & 255) !== 217) throw new Error("Card JPEG invalido. Nenhuma mensagem foi enviada.");
  const c = whatsappConfig_();
  if (c.phoneId !== "1360494423811214") throw new Error("Numero de origem divergente.");
  const response = UrlFetchApp.fetch(c.url.replace(/\/+$/, "") + "/" + c.phoneId + "/media", {
    method: "post", headers: {Authorization: "Bearer " + c.token}, muteHttpExceptions: true,
    payload: {messaging_product: "whatsapp", type: "image/jpeg", file: Utilities.newBlob(bytes, "image/jpeg", "aula-experimental.jpg")}
  });
  let data;
  try { data = JSON.parse(response.getContentText() || "{}"); } catch (_) { throw new Error("A Meta nao confirmou o carregamento do card. Nenhuma mensagem foi enviada."); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !/^\d+$/.test(String(data.id || ""))) throw new Error("A Meta recusou o carregamento do card. Nenhuma mensagem foi enviada.");
  return String(data.id);
}

// Executar no Apps Script antes de publicar o frontend. Nao envia mensagens.
function validarCardExperimentalFenix() {
  const c = whatsappConfig_();
  if (c.phoneId !== "1360494423811214" || cfg_(PROP.META_WABA_ID) !== "1260005122934753") throw new Error("Conta divergente.");
  const result = metaJson_("1260005122934753/message_templates?name=fenix_confirmacao_experimental_card&fields=name,status,category,language,components");
  const model = (result.data || []).find(function(t) { return t.name === "fenix_confirmacao_experimental_card" && t.language === "pt_BR"; });
  const hasImage = !!model && (model.components || []).some(function(c) { return c.type === "HEADER" && c.format === "IMAGE"; });
  const ready = !!model && model.status === "APPROVED" && model.category === "UTILITY" && hasImage;
  Logger.log(JSON.stringify({modelo: "fenix_confirmacao_experimental_card", status: model ? model.status : "NOT_CREATED", imagem: hasImage, pronto: ready, mensagensEnviadas: 0}));
  if (!ready) throw new Error("Modelo com imagem ainda nao esta aprovado como Utilidade.");
  return true;
}
