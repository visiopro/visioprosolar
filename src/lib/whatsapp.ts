import "server-only";

/** Lê a variável tolerando erros comuns de cópia: "NOME=valor", aspas, espaços e barra no fim */
function variavel(nome: "EVOLUTION_API_URL" | "EVOLUTION_API_KEY") {
  let v = (process.env[nome] ?? "").trim();
  if (v.startsWith(`${nome}=`)) v = v.slice(nome.length + 1).trim();
  v = v.replace(/^["']|["']$/g, "").trim();
  return nome === "EVOLUTION_API_URL" ? v.replace(/\/+$/, "") : v;
}

/** Envio pela Evolution API (v2). A instância é configurada por usina. */
export async function enviarDocumento(p: {
  instancia: string;
  numero: string;          // 55 + DDD + número
  legenda: string;
  pdf: Buffer;
  nomeArquivo: string;
  token?: string | null; // token da instância; sem ele usa a chave global
}) {
  const url = variavel("EVOLUTION_API_URL");
  const key = p.token || variavel("EVOLUTION_API_KEY");
  if (!url || !key) throw new Error("WhatsApp não configurado: falta EVOLUTION_API_URL ou a chave (global ou da instância).");
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

export async function enviarTexto(p: { instancia: string; numero: string; texto: string; token?: string | null }) {
  const url = variavel("EVOLUTION_API_URL");
  const key = p.token || variavel("EVOLUTION_API_KEY");
  if (!url || !key) throw new Error("WhatsApp não configurado: falta EVOLUTION_API_URL ou a chave (global ou da instância).");
  const res = await fetch(`${url}/message/sendText/${encodeURIComponent(p.instancia)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ number: p.numero, text: p.texto }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WhatsApp recusou o envio (${res.status}).`);
}
