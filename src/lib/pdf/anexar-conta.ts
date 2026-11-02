import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const ROSA = rgb(0.75, 0.1, 0.55);

/** Marca a página da distribuidora: faixa no topo + "NÃO PAGAR" na diagonal */
function carimbar(pagina: PDFPage, negrito: PDFFont, normal: PDFFont, aviso: string) {
  const { width: w, height: h } = pagina.getSize();
  // faixa de aviso no topo
  const faixa = Math.max(22, h * 0.032);
  pagina.drawRectangle({ x: 0, y: h - faixa, width: w, height: faixa, color: rgb(1, 0.95, 0.98), opacity: 0.95 });
  pagina.drawRectangle({ x: 0, y: h - faixa, width: w, height: 1.2, color: ROSA });
  const tam = Math.min(9, faixa * 0.42);
  const largura = normal.widthOfTextAtSize(aviso, tam);
  pagina.drawText(aviso, { x: Math.max(8, (w - largura) / 2), y: h - faixa + (faixa - tam) / 2 + 1, size: tam, font: normal, color: ROSA });

  // carimbo diagonal, centralizado
  const texto = "NÃO PAGAR";
  const tamanho = Math.min(w, h) * 0.16;
  const larg = negrito.widthOfTextAtSize(texto, tamanho);
  const ang = (Math.atan2(h, w) * 180) / Math.PI;
  const rad = (ang * Math.PI) / 180;
  const x = w / 2 - (larg / 2) * Math.cos(rad) + (tamanho / 3) * Math.sin(rad);
  const y = h / 2 - (larg / 2) * Math.sin(rad) - (tamanho / 3) * Math.cos(rad);
  pagina.drawText(texto, { x, y, size: tamanho, font: negrito, color: ROSA, opacity: 0.35, rotate: degrees(ang) });
}

/**
 * Junta a conta original da distribuidora no fim da fatura da usina, marcada "NÃO PAGAR",
 * para o cliente ver de onde saíram os valores. Se o arquivo não abrir, devolve a fatura como está.
 */
export async function anexarContaOriginal(fatura: Uint8Array, conta: { bytes: Uint8Array; tipo: string }, distribuidora: string) {
  try {
    const doc = await PDFDocument.load(fatura);
    const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const aviso = `Conta da ${distribuidora} paga pela usina · apenas demonstrativo · NÃO PAGAR`;

    if (conta.tipo === "application/pdf") {
      const original = await PDFDocument.load(conta.bytes);
      const paginas = await doc.copyPages(original, original.getPageIndices().slice(0, 4));
      for (const p of paginas) {
        doc.addPage(p);
        carimbar(p, negrito, normal, aviso);
      }
    } else if (conta.tipo === "image/jpeg" || conta.tipo === "image/png") {
      const img = conta.tipo === "image/png" ? await doc.embedPng(conta.bytes) : await doc.embedJpg(conta.bytes);
      const [aw, ah] = [595.28, 841.89]; // A4
      const margem = 24;
      const escala = Math.min((aw - 2 * margem) / img.width, (ah - 2 * margem - 30) / img.height);
      const p = doc.addPage([aw, ah]);
      p.drawImage(img, { x: (aw - img.width * escala) / 2, y: margem, width: img.width * escala, height: img.height * escala });
      carimbar(p, negrito, normal, aviso);
    } else {
      return fatura; // WebP e outros: o PDF não embute; o original continua no app
    }
    return await doc.save();
  } catch (e) {
    console.error("anexar conta original falhou:", e);
    return fatura;
  }
}
