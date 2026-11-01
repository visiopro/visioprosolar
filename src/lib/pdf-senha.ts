import "server-only";

/** Detecta PDF com senha (dicionário /Encrypt no arquivo) */
export const pdfComSenha = (bytes: Uint8Array) => /\/Encrypt\b/.test(Buffer.from(bytes).toString("latin1"));

const digitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/**
 * Monta as senhas prováveis a partir dos CPFs/CNPJs.
 * Coelba/Neoenergia: 5 primeiros dígitos do CPF/CNPJ do titular.
 * Também tenta 4, 6 e o documento inteiro por segurança.
 */
export function senhasProvaveis(documentos: (string | null | undefined)[]): string[] {
  const lista: string[] = [];
  for (const d of documentos.map(digitos).filter((d) => d.length >= 4)) {
    lista.push(d.slice(0, 5), d.slice(0, 4), d.slice(0, 6), d);
  }
  return Array.from(new Set(lista.filter(Boolean)));
}

/**
 * Tenta desbloquear o PDF com as senhas. Devolve o PDF sem senha
 * ou null se nenhuma senha serviu. PDF sem senha volta como está.
 */
export async function desbloquearPdf(bytes: Uint8Array, senhas: string[]): Promise<Uint8Array | null> {
  if (!pdfComSenha(bytes)) return bytes;
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    if (doc.needsPassword()) {
      const ok = ["", ...senhas].some((s) => doc.authenticatePassword(s) > 0);
      if (!ok) return null;
    }
    const pdf = doc.asPDF();
    if (!pdf) return null;
    return pdf.saveToBuffer("encrypt=none,garbage=compact").asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}

/** Senhas da usina: documento da usina (titular das contas) + documentos dos clientes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function senhasDaUsina(db: any, usinaId: string): Promise<string[]> {
  const [u, c] = await Promise.all([
    db.from("usinas").select("documento").eq("id", usinaId).maybeSingle(),
    db.from("clientes").select("documento").eq("usina_id", usinaId).not("documento", "is", null),
  ]);
  const docs = [u.data?.documento, ...((c.data ?? []) as { documento: string | null }[]).map((x) => x.documento)];
  return senhasProvaveis(docs);
}
