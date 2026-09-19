import "server-only";

/** Envio pela Evolution API (v2). A instância é configurada por usina. */
export async function enviarDocumento(p: {
  instancia: string;
  numero: string;          // 55 + DDD + número
  legenda: string;
  pdf: Buffer;
  nomeArquivo: string;
}) {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("WhatsApp não configurado no servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
  const res = await fetch(`${url.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(p.instancia)}`, {
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
  if (!res.ok) throw new Error(`WhatsApp recusou o envio (${res.status}). Confira se a instância está conectada.`);
}

export async function enviarTexto(p: { instancia: string; numero: string; texto: string }) {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("WhatsApp não configurado no servidor.");
  const res = await fetch(`${url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(p.instancia)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ number: p.numero, text: p.texto }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WhatsApp recusou o envio (${res.status}).`);
}
