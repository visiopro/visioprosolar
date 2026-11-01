import { contexto } from "@/lib/usina";
import { montarRelatorio, type FaturaRelatorio } from "@/lib/relatorio";

export const runtime = "nodejs";

const cel = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const kwh = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const STATUS: Record<string, string> = { pendente: "Em aberto", paga: "Paga" };

/** Planilha do resultado da usina pelo mês de referência das contas */
export async function GET(req: Request) {
  const { supabase, usina } = await contexto();
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response("mês inválido", { status: 400 });
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

  const [{ data: faturas }, { data: despesas }] = await Promise.all([
    supabase.from("faturas").select("id, numero, referencia, status, consumo_kwh, compensada_kwh, sem_usina_centavos, total_centavos, valor_recebido_centavos, custo_usina_centavos, snapshot").eq("usina_id", usina.id).eq("referencia", `${mes}-01`),
    supabase.from("despesas").select("descricao, valor_centavos, vencimento, categoria, fatura_id").eq("usina_id", usina.id).is("fatura_id", null).gte("vencimento", `${mes}-01`).lte("vencimento", fim),
  ]);
  const r = montarRelatorio(
    (faturas ?? []).map((f) => {
      const c = (f.snapshot as { cliente: { nome: string; uc: string } }).cliente;
      return { ...f, consumo_kwh: f.consumo_kwh === null ? null : Number(f.consumo_kwh), compensada_kwh: Number(f.compensada_kwh ?? 0), cliente: c.nome, uc: c.uc } as FaturaRelatorio;
    }),
    despesas ?? [],
  );

  const linhas = [
    [`Resultado da usina ${usina.nome} · contas de ${mes.split("-").reverse().join("/")}`],
    [],
    ["Cliente", "UC", "kWh vendidos", "Conta sem usina (R$)", "Fatura (R$)", "Conta mínima (R$)", "Lucro (R$)", "Status"],
    ...r.linhas.map((l) => [l.cliente, l.uc, kwh(l.kwh), reais(l.semUsina), reais(l.fatura), reais(l.contaMinima), reais(l.lucro), STATUS[l.status] ?? l.status]),
    ["Total", "", kwh(r.kwh), reais(r.semUsina), reais(r.bruto), reais(r.contasMinimas), reais(r.lucroLiquido), ""],
    [],
    ["Faturamento bruto", reais(r.bruto)],
    ["Já recebido", reais(r.recebido)],
    ["Contas mínimas pagas à distribuidora", reais(r.contasMinimas)],
    ["Lucro líquido", reais(r.lucroLiquido)],
    ["Outras despesas do mês", reais(r.outrasDespesas)],
    ...(despesas ?? []).map((d) => [`  ${d.descricao}`, reais(Number(d.valor_centavos))]),
    ["Resultado final", reais(r.resultado)],
  ].map((l) => l.map(cel).join(";"));

  return new Response("﻿" + linhas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="resultado_usina_${mes}.csv"` },
  });
}
