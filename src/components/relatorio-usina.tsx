import { brl, mesRef, numero } from "@/lib/format";
import type { Relatorio } from "@/lib/relatorio";
import { Cartao, Status, cx } from "./ui";
import { BotaoImprimir } from "./financeiro";

export type PontoSerie = { m: string; kwh: number; lucro: number };

/** Quanto a usina vendeu, gastou e lucrou nas contas do mês de referência */
export function RelatorioUsina({ r, mes, serie }: { r: Relatorio; mes: string; serie: PontoSerie[] }) {
  const maior = Math.max(1, ...serie.map((s) => Math.abs(s.lucro)));
  const margem = r.bruto ? Math.round((r.lucroLiquido / r.bruto) * 100) : 0;

  return (
    <section className="space-y-4" id="relatorio">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Resultado da usina · contas de {mesRef(`${mes}-01`)}</h2>
          <p className="text-xs text-nevoa">Pelo mês de referência das contas: o que vendeu, o que pagou à distribuidora e o que sobrou.</p>
        </div>
        <div className="flex items-center gap-4 print:hidden">
          <a href={`/api/financeiro/relatorio?mes=${mes}`} className="text-sm text-nevoa hover:text-texto">Baixar planilha</a>
          <BotaoImprimir />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "kWh vendidos", v: `${numero(r.kwh, 0)} kWh`, s: `${r.linhas.length} cliente${r.linhas.length === 1 ? "" : "s"}` },
          { r: "Faturamento bruto", v: brl(r.bruto), s: `recebido ${brl(r.recebido)}` },
          { r: "Contas mínimas", v: brl(r.contasMinimas), s: "pagas à distribuidora" },
          { r: "Lucro líquido", v: brl(r.lucroLiquido), s: r.bruto ? `${margem}% do bruto` : undefined, c: r.lucroLiquido >= 0 ? "text-economia" : "text-erro" },
        ].map((m) => (
          <Cartao key={m.r} className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-nevoa">{m.r}</p>
            <p className={cx("mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl", m.c)}>{m.v}</p>
            {m.s ? <p className="mt-0.5 truncate text-[10px] text-nevoa sm:text-xs">{m.s}</p> : null}
          </Cartao>
        ))}
      </div>

      <Cartao className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="text-nevoa">Outras despesas do mês (manutenção, limpeza, financiamento…)</span>
        <span>{brl(r.outrasDespesas)}</span>
        <span className="w-full border-t border-traco pt-2 font-medium sm:w-auto sm:border-0 sm:pt-0">
          Resultado final: <span className={r.resultado >= 0 ? "text-economia" : "text-erro"}>{brl(r.resultado)}</span>
        </span>
      </Cartao>

      {r.linhas.length ? (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-right text-xs text-nevoa">
                <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                <th className="px-2 font-medium">kWh</th>
                <th className="px-2 font-medium">Sem usina</th>
                <th className="px-2 font-medium">Fatura</th>
                <th className="px-2 font-medium">Conta mínima</th>
                <th className="px-2 font-medium">Lucro</th>
                <th className="px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-traco">
              {r.linhas.map((l) => (
                <tr key={l.id} className="text-right">
                  <td className="max-w-[220px] px-4 py-2.5 text-left">
                    <a href={`/faturas/${l.id}`} className="block truncate hover:text-sol">{l.cliente}</a>
                    <span className="text-[11px] text-nevoa">UC {l.uc}</span>
                  </td>
                  <td className="px-2">{numero(l.kwh, 0)}</td>
                  <td className="px-2 text-nevoa">{brl(l.semUsina)}</td>
                  <td className="px-2">{brl(l.fatura)}</td>
                  <td className="px-2 text-nevoa">{brl(l.contaMinima)}</td>
                  <td className={cx("px-2 font-medium", l.lucro >= 0 ? "text-economia" : "text-erro")}>{brl(l.lucro)}</td>
                  <td className="px-4"><Status s={l.status as "pendente"} /></td>
                </tr>
              ))}
              <tr className="text-right font-semibold">
                <td className="px-4 py-3 text-left">Total</td>
                <td className="px-2">{numero(r.kwh, 0)}</td>
                <td className="px-2">{brl(r.semUsina)}</td>
                <td className="px-2">{brl(r.bruto)}</td>
                <td className="px-2">{brl(r.contasMinimas)}</td>
                <td className={cx("px-2", r.lucroLiquido >= 0 ? "text-economia" : "text-erro")}>{brl(r.lucroLiquido)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Cartao>
      ) : (
        <Cartao className="px-4 py-5 text-sm text-nevoa">Nenhuma fatura emitida para as contas de {mesRef(`${mes}-01`)} ainda.</Cartao>
      )}

      <Cartao className="overflow-x-auto px-3 pb-4 pt-5 sm:px-5">
        <p className="mb-3 text-sm font-medium">Lucro líquido e kWh vendidos · últimos 6 meses</p>
        <div className="flex h-36 items-end gap-2 sm:gap-3" style={{ minWidth: "280px" }}>
          {serie.map((s) => (
            <div key={s.m} className="flex flex-1 flex-col items-center gap-1">
              <span className="whitespace-nowrap text-[10px] text-nevoa sm:text-xs">{s.lucro ? brl(s.lucro).replace(/,\d{2}$/, "") : ""}</span>
              <div
                title={`${mesRef(`${s.m}-01`)}: lucro ${brl(s.lucro)} · ${numero(s.kwh, 0)} kWh`}
                className={cx("w-6 rounded-t sm:w-9", s.lucro >= 0 ? "bg-economia" : "bg-erro", s.m === mes ? "" : "opacity-60")}
                style={{ height: `${Math.max(2, (Math.abs(s.lucro) / maior) * 96)}px` }}
              />
              <span className={cx("whitespace-nowrap text-[10px] sm:text-xs", s.m === mes ? "text-sol" : "text-nevoa")}>{mesRef(`${s.m}-01`)}</span>
              <span className="whitespace-nowrap text-[10px] text-nevoa">{s.kwh ? `${numero(s.kwh, 0)} kWh` : "—"}</span>
            </div>
          ))}
        </div>
      </Cartao>
    </section>
  );
}
