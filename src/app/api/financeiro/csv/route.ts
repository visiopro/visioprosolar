import { contexto } from "@/lib/usina";
import { data } from "@/lib/format";
import { CATEGORIAS } from "@/lib/financeiro";

export const runtime = "nodejs";

const cel = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Entradas e saídas do mês, para o contador */
export async function GET(req: Request) {
  const { supabase, usina } = await contexto();
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("mês inválido", { status: 400 });
  const [a, m] = mes.split("-").map(Number);
  const ini = `${mes}-01`;
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

  const [{ data: entradas }, { data: saidas }] = await Promise.all([
    supabase.from("faturas").select("numero, paga_em, total_centavos, valor_recebido_centavos, pagamento_origem, snapshot").eq("usina_id", usina.id).eq("status", "paga").gte("paga_em", `${ini}T00:00:00-03:00`).lte("paga_em", `${fim}T23:59:59-03:00`).order("paga_em"),
    supabase.from("despesas").select("descricao, categoria, valor_centavos, vencimento, pago_em").eq("usina_id", usina.id).gte("vencimento", ini).lte("vencimento", fim).order("vencimento"),
  ]);

  const linhas = [
    ["Tipo", "Data", "Descrição", "Categoria", "Valor (R$)", "Situação"].map(cel).join(";"),
    ...(entradas ?? []).map((f) =>
      ["Entrada", data(f.paga_em), `Fatura ${f.numero} · ${(f.snapshot as { cliente: { nome: string } }).cliente.nome}`, f.pagamento_origem === "asaas" ? "Recebido via Asaas" : f.pagamento_origem === "mercadopago" ? "Recebido via Mercado Pago" : "Recebido", reais(Number(f.valor_recebido_centavos ?? f.total_centavos)), "Recebida"].map(cel).join(";"),
    ),
    ...(saidas ?? []).map((d) =>
      ["Saída", data(d.pago_em ?? d.vencimento), d.descricao, CATEGORIAS[d.categoria] ?? d.categoria, reais(Number(d.valor_centavos)), d.pago_em ? "Paga" : "Em aberto"].map(cel).join(";"),
    ),
  ];
  return new Response("\uFEFF" + linhas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="financeiro_${mes}.csv"` },
  });
}
