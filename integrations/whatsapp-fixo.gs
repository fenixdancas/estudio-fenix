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
  if (p.template !== "fenix_confirmacao_experimental") throw new Error("Modelo de WhatsApp nao permitido.");
  let values;
  try { values = JSON.parse(String(p.template_params || "[]")); }
  catch (_) { throw new Error("Parametros do modelo invalidos."); }
  if (!Array.isArray(values) || values.length !== 4 || values.some(function(v) { return typeof v !== "string" || !v.trim() || v.length > 1024 || /[\r\n\t]/.test(v); })) throw new Error("Informe os quatro parametros validos da aula experimental.");
  const waba = cfg_(PROP.META_WABA_ID);
  if (waba !== "1260005122934753") throw new Error("Conta WhatsApp divergente: envio bloqueado.");
  const result = metaJson_(encodeURIComponent(waba) + "/message_templates?name=" + encodeURIComponent(p.template) + "&fields=name,status,category,language");
  const approved = (result.data || []).some(function(t) { return t.name === p.template && t.language === "pt_BR" && t.status === "APPROVED" && t.category === "UTILITY"; });
  if (!approved) throw new Error("A Meta ainda nao aprovou este modelo como Utilidade. Nenhuma mensagem foi enviada.");
  return Object.assign(base, {type: "template", template: {name: p.template, language: {code: "pt_BR"}, components: [{type: "body", parameters: values.map(function(v) { return {type: "text", text: v.trim()}; })}]}});
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
