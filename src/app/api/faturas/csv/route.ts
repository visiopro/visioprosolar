import { contexto } from "@/lib/usina";
import { data, mesRef, nFatura } from "@/lib/format";

export const runtime = "nodejs";

const cel = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Planilha das faturas (abre direto no Excel em português) */
export async function GET(req: Request) {
  const { supabase, usina } = await contexto();
  const mes = new URL(req.url).searchParams.get("mes");
  let q = supabase.from("faturas").select("*").eq("usina_id", usina.id).order("referencia").order("numero");
  if (mes && /^\d{4}-\d{2}$/.test(mes)) q = q.eq("referencia", `${mes}-01`);
  const { data: faturas } = await q;

  const cab = ["Número", "Referência", "Cliente", "UC", "kWh compensados", "Tarifa", "Sem usina (R$)", "Total (R$)", "Economia (R$)", "Vencimento", "Status", "Pago em"];
  const linhas = (faturas ?? []).map((f) => {
    const c = (f.snapshot as { cliente: { nome: string; uc: string } }).cliente;
    return [
      nFatura(f.numero), mesRef(f.referencia), c.nome, c.uc,
      String(f.compensada_kwh).replace(".", ","), String(f.tarifa).replace(".", ","),
      reais(Number(f.sem_usina_centavos)), reais(Number(f.total_centavos)), reais(Number(f.economia_centavos)),
      data(f.vencimento), f.status, f.paga_em ? data(f.paga_em) : "",
    ].map(cel).join(";");
  });
  const csv = "\uFEFF" + [cab.map(cel).join(";"), ...linhas].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="faturas${mes ? `_${mes}` : ""}.csv"`,
    },
  });
}
