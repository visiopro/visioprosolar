import "server-only";

type UsoWhatsApp = "fatura" | "texto" | "boas_vindas";

function variavel(nome: string) {
  let v = (process.env[nome] ?? "").trim();
  if (v.startsWith(`${nome}=`)) v = v.slice(nome.length + 1).trim();
  return v.replace(/^['"]|['"]$/g, "").trim();
}

function provedor() {
  const v = variavel("WHATSAPP_PROVIDER").toLowerCase() || "evolution";
  if (v !== "evolution" && v !== "meta_cloud") throw new Error("WHATSAPP_PROVIDER deve ser evolution ou meta_cloud.");
  return v;
}

export function usaWhatsAppOficial() {
  return provedor() === "meta_cloud";
}

/** O número oficial é central; no modo Evolution cada usina ainda precisa da instância. */
export function whatsappDisponivel(instancia: string | null, uso: UsoWhatsApp = "fatura") {
  if (usaWhatsAppOficial()) {
    const comum = variavel("WHATSAPP_META_PHONE_NUMBER_ID") && variavel("WHATSAPP_META_ACCESS_TOKEN") &&
      /^v\d+\.\d+$/.test(variavel("WHATSAPP_META_API_VERSION"));
    const modelo = uso === "fatura"
      ? variavel("WHATSAPP_TEMPLATE_FATURA")
      : uso === "boas_vindas"
        ? (variavel("WHATSAPP_TEMPLATE_BOAS_VINDAS") || variavel("WHATSAPP_TEMPLATE_TEXTO"))
        : variavel("WHATSAPP_TEMPLATE_TEXTO");
    return Boolean(comum && /^[a-z0-9_]+$/.test(modelo));
  }
  return Boolean(instancia);
}

function configuracaoMeta(modelo: string) {
  const phoneId = variavel("WHATSAPP_META_PHONE_NUMBER_ID");
  const token = variavel("WHATSAPP_META_ACCESS_TOKEN");
  const versao = variavel("WHATSAPP_META_API_VERSION");
  if (!/^\d+$/.test(phoneId) || !token || !/^v\d+\.\d+$/.test(versao)) {
    throw new Error("Canal oficial incompleto. Configure o ID do número, o token e a versão da API da Meta.");
  }
  const template = variavel(modelo);
  if (!/^[a-z0-9_]+$/.test(template)) {
    throw new Error(`Configure e aprove na Meta o modelo ${modelo}.`);
  }
  const idioma = variavel("WHATSAPP_TEMPLATE_LANGUAGE") || "pt_BR";
  return { base: `https://graph.facebook.com/${versao}/${phoneId}`, token, template, idioma };
}

async function respostaMeta(res: Response) {
  const body = await res.json().catch(() => null) as { error?: { message?: string }; id?: string } | null;
  if (!res.ok) {
    const detalhe = body?.error?.message;
    throw new Error(`WhatsApp oficial recusou o envio (${res.status})${detalhe ? `: ${detalhe}` : "."}`);
  }
  return body;
}

async function enviarTextoMeta(p: { numero: string; texto: string; usinaNome: string }) {
  const c = configuracaoMeta("WHATSAPP_TEMPLATE_TEXTO");
  const textoSemCabecalho = p.texto.replace(/^\*[^\n]+\*\n/, "");
  // A Meta Cloud API proíbe quebras de linha (\r, \n), tabs ou mais de 4 espaços consecutivos em parâmetros.
  const textoLimpo = textoSemCabecalho
    .replace(/[\r\n\t]+/g, " • ")
    .replace(/\s{4,}/g, " ")
    .trim();
  const res = await fetch(`${c.base}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.numero,
      type: "template",
      template: {
        name: c.template,
        language: { code: c.idioma },
        components: [{ type: "body", parameters: [
          { type: "text", text: p.usinaNome },
          { type: "text", text: textoLimpo },
        ] }],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  await respostaMeta(res);
}

async function enviarBoasVindasMeta(p: {
  numero: string;
  usinaNome: string;
  uc: string;
  distribuidora: string;
  portal: string;
}) {
  const c = configuracaoMeta("WHATSAPP_TEMPLATE_BOAS_VINDAS");
  const res = await fetch(`${c.base}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.numero,
      type: "template",
      template: {
        name: c.template,
        language: { code: c.idioma },
        components: [{ type: "body", parameters: [
          { type: "text", text: p.usinaNome },
          { type: "text", text: p.uc },
          { type: "text", text: p.distribuidora },
          { type: "text", text: p.portal },
        ] }],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  await respostaMeta(res);
}

async function enviarFaturaMeta(p: {
  numero: string;
  pdf: Buffer;
  nomeArquivo: string;
  dados: { usinaNome: string; clienteNome: string; referencia: string; valor: string; vencimento: string; pix: string };
}) {
  const c = configuracaoMeta("WHATSAPP_TEMPLATE_FATURA");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([Uint8Array.from(p.pdf)], { type: "application/pdf" }), p.nomeArquivo);
  const upload = await fetch(`${c.base}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const media = await respostaMeta(upload);
  if (!media?.id) throw new Error("A Meta não retornou o ID do PDF enviado.");

  const envio = await fetch(`${c.base}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.numero,
      type: "template",
      template: {
        name: c.template,
        language: { code: c.idioma },
        components: [
          { type: "header", parameters: [{ type: "document", document: { id: media.id, filename: p.nomeArquivo } }] },
          { type: "body", parameters: [
            { type: "text", text: p.dados.usinaNome },
            { type: "text", text: p.dados.clienteNome },
            { type: "text", text: p.dados.referencia },
            { type: "text", text: p.dados.valor },
            { type: "text", text: p.dados.vencimento },
            { type: "text", text: p.dados.pix || "Consulte o QR code no PDF." },
          ] },
        ],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  await respostaMeta(envio);
}

/** Envio pela Evolution API (mantido para contas que já usam esse canal). */
export async function enviarDocumento(p: {
  instancia: string | null;
  numero: string;
  legenda: string;
  pdf: Buffer;
  nomeArquivo: string;
  usinaNome: string;
  dadosFatura: { clienteNome: string; referencia: string; valor: string; vencimento: string; pix: string };
  token?: string | null;
}) {
  if (usaWhatsAppOficial()) {
    await enviarFaturaMeta({
      numero: p.numero,
      pdf: p.pdf,
      nomeArquivo: p.nomeArquivo,
      dados: { ...p.dadosFatura, usinaNome: p.usinaNome },
    });
    return;
  }

  const url = variavel("EVOLUTION_API_URL").replace(/\/+$/, "");
  const key = p.token || variavel("EVOLUTION_API_KEY");
  if (!p.instancia || !url || !key) throw new Error("WhatsApp não configurado: falta a instância ou a chave da Evolution.");
  const res = await fetch(`${url}/message/sendMedia/${encodeURIComponent(p.instancia)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({
      number: p.numero,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: p.legenda,
      media: p.pdf.toString("base64"),
      fileName: p.nomeArquivo,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "A Evolution recusou a chave (401). Confira o token da instância no painel admin ou a EVOLUTION_API_KEY." : `WhatsApp recusou o envio (${res.status}). Confira se a instância está conectada.`);
}

export async function enviarTexto(p: { instancia: string | null; numero: string; texto: string; usinaNome: string; token?: string | null }) {
  if (usaWhatsAppOficial()) {
    await enviarTextoMeta(p);
    return;
  }

  const url = variavel("EVOLUTION_API_URL").replace(/\/+$/, "");
  const key = p.token || variavel("EVOLUTION_API_KEY");
  if (!p.instancia || !url || !key) throw new Error("WhatsApp não configurado: falta a instância ou a chave da Evolution.");
  const texto = p.texto.startsWith("000201") || p.texto.startsWith(`*${p.usinaNome}*\n`) ? p.texto : `*${p.usinaNome}*\n${p.texto}`;
  const res = await fetch(`${url}/message/sendText/${encodeURIComponent(p.instancia)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ number: p.numero, text: texto }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WhatsApp recusou o envio (${res.status}).`);
}

export async function enviarBoasVindas(p: {
  instancia: string | null;
  numero: string;
  texto: string;
  usinaNome: string;
  uc: string;
  distribuidora: string;
  portal: string;
  token?: string | null;
}) {
  if (usaWhatsAppOficial()) {
    const templateBoasVindas = variavel("WHATSAPP_TEMPLATE_BOAS_VINDAS");
    if (templateBoasVindas && /^[a-z0-9_]+$/.test(templateBoasVindas)) {
      await enviarBoasVindasMeta({
        numero: p.numero,
        usinaNome: p.usinaNome,
        uc: p.uc,
        distribuidora: p.distribuidora,
        portal: p.portal,
      });
      return;
    }
    // Fallback: se ainda não tiver o template específico aprovado, envia pelo modelo de texto padrão com quebras sanitizadas
    await enviarTextoMeta({ numero: p.numero, texto: p.texto, usinaNome: p.usinaNome });
    return;
  }

  // Evolution API: envia com as quebras normais
  await enviarTexto({
    instancia: p.instancia,
    numero: p.numero,
    texto: p.texto,
    usinaNome: p.usinaNome,
    token: p.token,
  });
}
