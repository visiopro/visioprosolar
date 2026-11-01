import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { contexto } from "@/lib/usina";
import { brl, data, hojeBR, mesExtenso, mesRef, somarDias } from "@/lib/format";
import { CATEGORIAS } from "@/lib/financeiro";
import { Cartao, Status, cx } from "@/components/ui";
import { AcoesDespesa, NovaDespesa } from "@/components/financeiro";
import { RelatorioUsina } from "@/components/relatorio-usina";
import { montarRelatorio, type FaturaRelatorio } from "@/lib/relatorio";

const deslocar = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function Financeiro({ searchParams }: { searchParams: Promise<{ mes?: string; ref?: string }> }) {
  const { supabase, usina, papel } = await contexto();
  const hoje = hojeBR();
  const sp = await searchParams;
  const q = sp.mes;
  const mes = q && MES.test(q) ? q : hoje.slice(0, 7);

  // Relatório por mês de referência das contas. Sem escolha: a referência mais recente já faturada até este mês
  let ref = sp.ref && MES.test(sp.ref) ? sp.ref : "";
  if (!ref) {
    const { data: ultima } = await supabase.from("faturas").select("referencia").eq("usina_id", usina.id).neq("status", "cancelada").lte("referencia", `${mes}-01`).order("referencia", { ascending: false }).limit(1).maybeSingle();
    ref = ultima ? String(ultima.referencia).slice(0, 7) : mes;
  }
  const iniRef = `${deslocar(ref, -5)}-01`;
  const [fatRef, despRef] = await Promise.all([
    supabase.from("faturas").select("id, numero, referencia, status, consumo_kwh, compensada_kwh, sem_usina_centavos, total_centavos, valor_recebido_centavos, custo_usina_centavos, snapshot").eq("usina_id", usina.id).gte("referencia", iniRef).lte("referencia", `${ref}-01`),
    supabase.from("despesas").select("valor_centavos, vencimento, categoria, fatura_id").eq("usina_id", usina.id).is("fatura_id", null).gte("vencimento", iniRef).lte("vencimento", fimDoMes(ref)),
  ]);
  const paraRelatorio = (fatRef.data ?? []).map((f): FaturaRelatorio => {
    const c = (f.snapshot as { cliente: { nome: string; uc: string } }).cliente;
    return { ...f, consumo_kwh: f.consumo_kwh === null ? null : Number(f.consumo_kwh), compensada_kwh: Number(f.compensada_kwh ?? 0), cliente: c.nome, uc: c.uc } as FaturaRelatorio;
  });
  const despesasRef = despRef.data ?? [];
  const relatorioDe = (m: string) => montarRelatorio(
    paraRelatorio.filter((f) => f.referencia.slice(0, 7) === m),
    despesasRef.filter((d) => d.vencimento.slice(0, 7) === m),
  );
  const relatorio = relatorioDe(ref);
  const serieRelatorio = Array.from({ length: 6 }, (_, i) => {
    const m = deslocar(ref, i - 5);
    const r = m === ref ? relatorio : relatorioDe(m);
    return { m, kwh: r.kwh, lucro: r.lucroLiquido };
  });
  const ini = `${mes}-01`;
  const fim = fimDoMes(mes);
  const iniSerie = `${deslocar(mes, -5)}-01`;

  const [recebidas, aReceber, despesasMes, atrasadas, pagasSerie, recebidasSerie] = await Promise.all([
    supabase.from("faturas").select("id, total_centavos, valor_recebido_centavos").eq("usina_id", usina.id).eq("status", "paga").gte("paga_em", `${ini}T00:00:00-03:00`).lte("paga_em", `${fim}T23:59:59-03:00`),
    supabase.from("faturas").select("id, numero, vencimento, total_centavos, snapshot, cobranca_gateway").eq("usina_id", usina.id).eq("status", "pendente").lte("vencimento", fim).order("vencimento"),
    supabase.from("despesas").select("*").eq("usina_id", usina.id).gte("vencimento", ini).lte("vencimento", fim).order("vencimento"),
    supabase.from("despesas").select("*").eq("usina_id", usina.id).is("pago_em", null).lt("vencimento", ini).order("vencimento"),
    supabase.from("despesas").select("valor_centavos, pago_em").eq("usina_id", usina.id).gte("pago_em", iniSerie).lte("pago_em", fim),
    supabase.from("faturas").select("total_centavos, valor_recebido_centavos, paga_em").eq("usina_id", usina.id).eq("status", "paga").gte("paga_em", `${iniSerie}T00:00:00-03:00`).lte("paga_em", `${fim}T23:59:59-03:00`),
  ]);

  const valorFatura = (f: { total_centavos: number; valor_recebido_centavos: number | null }) => Number(f.valor_recebido_centavos ?? f.total_centavos);
  const recebido = (recebidas.data ?? []).reduce((s, f) => s + valorFatura(f), 0);
  const receber = aReceber.data ?? [];
  const totalReceber = receber.reduce((s, f) => s + Number(f.total_centavos), 0);
  const vencidas = receber.filter((f) => f.vencimento < hoje).length;

  const aPagar = [...(atrasadas.data ?? []), ...(despesasMes.data ?? []).filter((d) => !d.pago_em)];
  const pagasNoMes = (pagasSerie.data ?? []).filter((d) => d.pago_em! >= ini && d.pago_em! <= fim);
  const pago = pagasNoMes.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const totalPagar = aPagar.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const pagasLista = (despesasMes.data ?? []).filter((d) => d.pago_em);
  const resultado = recebido - pago;

  const riscoCorte = aPagar.filter((d) => d.categoria === "conta_distribuidora" && d.vencimento <= somarDias(hoje, 3));

  const serie = Array.from({ length: 6 }, (_, i) => {
    const m = deslocar(mes, i - 5);
    const entra = (recebidasSerie.data ?? []).filter((f) => String(f.paga_em).slice(0, 7) === m).reduce((s, f) => s + valorFatura(f), 0);
    const sai = (pagasSerie.data ?? []).filter((d) => String(d.pago_em).slice(0, 7) === m).reduce((s, d) => s + Number(d.valor_centavos), 0);
    return { m, entra, sai };
  });
  const maior = Math.max(1, ...serie.flatMap((s) => [s.entra, s.sai]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={`/financeiro?mes=${deslocar(mes, -1)}`} aria-label="Mês anterior" className="rounded-lg p-2 text-nevoa hover:text-texto"><ChevronLeft size={20} /></Link>
          <h1 className="text-[26px] font-semibold capitalize tracking-tight">{mesExtenso(ini)}</h1>
          <Link href={`/financeiro?mes=${deslocar(mes, 1)}`} aria-label="Próximo mês" className="rounded-lg p-2 text-nevoa hover:text-texto"><ChevronRight size={20} /></Link>
        </div>
        <div className="flex items-center gap-4">
          <a href={`/api/financeiro/csv?mes=${mes}`} className="text-sm text-nevoa hover:text-texto">Baixar CSV</a>
          <NovaDespesa hoje={hoje} />
        </div>
      </div>

      {riscoCorte.length ? (
        <div role="alert" className="flex gap-3 rounded-[var(--radius-cartao)] border border-erro/40 bg-erro/5 p-4 text-sm">
          <AlertTriangle size={20} className="shrink-0 text-erro" />
          <div>
            <p className="font-medium text-erro">
              {riscoCorte.length === 1 ? "1 conta da distribuidora vence" : `${riscoCorte.length} contas da distribuidora vencem`} em até 3 dias ou já venceram
            </p>
            <p className="mt-0.5 text-nevoa">As contas estão no nome da usina. Atraso pode gerar corte de energia do cliente.</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1 text-sm text-nevoa print:hidden">
        <span>Relatório das contas de</span>
        <Link href={`/financeiro?mes=${mes}&ref=${deslocar(ref, -1)}#relatorio`} aria-label="Referência anterior" className="rounded p-1 hover:text-texto"><ChevronLeft size={16} /></Link>
        <span className="font-medium text-texto">{mesRef(`${ref}-01`)}</span>
        <Link href={`/financeiro?mes=${mes}&ref=${deslocar(ref, 1)}#relatorio`} aria-label="Próxima referência" className="rounded p-1 hover:text-texto"><ChevronRight size={16} /></Link>
      </div>
      <RelatorioUsina r={relatorio} mes={ref} serie={serieRelatorio} />

      <h2 className="pt-2 font-semibold">Caixa de {mesExtenso(ini)}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "Recebido", v: recebido, c: "text-economia" },
          { r: "A receber", v: totalReceber, s: vencidas ? `${vencidas} vencida${vencidas > 1 ? "s" : ""}` : undefined },
          { r: "Pago", v: pago, s: totalPagar ? `falta pagar ${brl(totalPagar)}` : undefined },
          { r: "Resultado", v: resultado, c: resultado >= 0 ? "text-economia" : "text-erro" },
        ].map((m) => (
          <Cartao key={m.r} className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-nevoa">{m.r}</p>
            <p className={cx("mt-1 text-xl sm:text-2xl font-semibold tracking-tight truncate", m.c)}>{brl(m.v)}</p>
            {m.s ? <p className="mt-0.5 text-[10px] sm:text-xs text-nevoa truncate">{m.s}</p> : null}
          </Cartao>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">A receber dos clientes</h2>
          {receber.length ? (
            <Cartao className="divide-y divide-traco">
              {receber.map((f) => (
                <Link key={f.id} href={`/faturas/${f.id}`} className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4 hover:bg-relevo/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm sm:text-base">{(f.snapshot as { cliente: { nome: string } }).cliente.nome}</span>
                    <span className="block truncate text-[11px] sm:text-xs text-nevoa">vence {data(f.vencimento)}{f.cobranca_gateway === "asaas" ? " · Asaas" : f.cobranca_gateway === "mercadopago" ? " · Mercado Pago" : ""}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <Status s="pendente" vencida={f.vencimento < hoje} />
                    <span className="text-sm sm:text-base font-medium">{brl(Number(f.total_centavos))}</span>
                  </span>
                </Link>
              ))}
            </Cartao>
          ) : (
            <Cartao className="px-4 py-5 text-sm text-nevoa">Nada pendente até o fim deste mês.</Cartao>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold">A pagar pela usina</h2>
          {aPagar.length ? (
            <Cartao className="divide-y divide-traco">
              {aPagar.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate">{d.descricao}</span>
                    <span className={cx("text-xs", d.vencimento < hoje ? "text-erro" : "text-nevoa")}>
                      {CATEGORIAS[d.categoria]} · {d.vencimento < hoje ? "venceu" : "vence"} {data(d.vencimento)}
                      {d.parcelas ? ` · ${d.parcela}/${d.parcelas}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{brl(Number(d.valor_centavos))}</span>
                    <AcoesDespesa id={d.id} paga={false} serie={!!d.grupo_id} podeExcluir={papel === "dono"} />
                  </span>
                </div>
              ))}
            </Cartao>
          ) : (
            <Cartao className="px-4 py-5 text-sm text-nevoa">Nenhuma conta a pagar neste mês.</Cartao>
          )}
        </section>
      </div>

      {pagasLista.length ? (
        <section>
          <h2 className="mb-3 font-semibold">Pagas neste mês</h2>
          <Cartao className="divide-y divide-traco">
            {pagasLista.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{d.descricao}</span>
                  <span className="text-xs text-nevoa">{CATEGORIAS[d.categoria]} · paga em {data(d.pago_em)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span>{brl(Number(d.valor_centavos))}</span>
                  <AcoesDespesa id={d.id} paga serie={!!d.grupo_id} podeExcluir={papel === "dono"} />
                </span>
              </div>
            ))}
          </Cartao>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-semibold">Fluxo de caixa</h2>
        <Cartao className="overflow-x-auto px-3 pb-4 pt-6 sm:px-5">
          <div className="flex h-40 items-end gap-2 sm:gap-3" style={{ minWidth: "280px" }}>
            {serie.map((s) => (
              <div key={s.m} className="flex flex-1 flex-col items-center gap-1.5 sm:gap-2">
                <div className="flex h-32 items-end gap-0.5 sm:gap-1">
                  <div title={`Entradas ${brl(s.entra)}`} className="w-3 rounded-t bg-economia sm:w-5" style={{ height: `${Math.max(2, (s.entra / maior) * 128)}px` }} />
                  <div title={`Saídas ${brl(s.sai)}`} className="w-3 rounded-t bg-nevoa/50 sm:w-5" style={{ height: `${Math.max(2, (s.sai / maior) * 128)}px` }} />
                </div>
                <span className={cx("whitespace-nowrap text-[10px] sm:text-xs", s.m === mes ? "text-sol" : "text-nevoa")}>{mesRef(`${s.m}-01`)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex gap-4 text-xs text-nevoa">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-economia" /> Entradas</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-nevoa/50" /> Saídas</span>
          </p>
        </Cartao>
      </section>
    </div>
  );
}
