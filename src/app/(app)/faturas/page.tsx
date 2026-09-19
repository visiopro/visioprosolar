import Link from "next/link";
import { contexto } from "@/lib/usina";
import { brl, data, hojeBR, mesRef, nFatura } from "@/lib/format";
import { BotaoLink, Cabecalho, Cartao, Status, Vazio, cx } from "@/components/ui";

const FILTROS = [
  { v: "", r: "Todas" },
  { v: "pendente", r: "Pendentes" },
  { v: "vencida", r: "Vencidas" },
  { v: "paga", r: "Pagas" },
  { v: "cancelada", r: "Canceladas" },
];

export default async function Faturas({ searchParams }: { searchParams: Promise<{ status?: string; mes?: string }> }) {
  const { supabase, usina } = await contexto();
  const { status = "", mes = "" } = await searchParams;
  const hoje = hojeBR();

  let q = supabase
    .from("faturas")
    .select("id, numero, referencia, vencimento, status, total_centavos, snapshot")
    .eq("usina_id", usina.id)
    .order("referencia", { ascending: false })
    .order("numero", { ascending: false })
    .limit(200);
  if (status === "vencida") q = q.eq("status", "pendente").lt("vencimento", hoje);
  else if (status) q = q.eq("status", status);
  if (/^\d{4}-\d{2}$/.test(mes)) q = q.eq("referencia", `${mes}-01`);
  const { data: faturas } = await q;

  const link = (s: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (mes) p.set("mes", mes);
    const qs = p.toString();
    return qs ? `/faturas?${qs}` : "/faturas";
  };
  const total = (faturas ?? []).filter((f) => f.status !== "cancelada").reduce((s, f) => s + Number(f.total_centavos), 0);

  return (
    <>
      <Cabecalho titulo="Faturas" sub={faturas?.length ? `${faturas.length} faturas · ${brl(total)}` : undefined} acao={<BotaoLink href="/contas/nova">Lançar conta</BotaoLink>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.v}
            href={link(f.v)}
            className={cx("rounded-full border px-3.5 py-1.5 text-sm", status === f.v ? "border-sol text-sol" : "border-traco text-nevoa hover:text-texto")}
          >
            {f.r}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input type="month" name="mes" defaultValue={mes} className="campo w-auto py-1.5 text-sm" aria-label="Filtrar por mês" />
          <button className="text-sm text-sol">Filtrar</button>
        </form>
      </div>

      {faturas?.length ? (
        <Cartao className="divide-y divide-traco">
          {faturas.map((f) => {
            const cli = (f.snapshot as { cliente: { nome: string; uc: string } }).cliente;
            return (
              <Link key={f.id} href={`/faturas/${f.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-3.5 hover:bg-relevo/50">
                <span className="min-w-0">
                  <span className="block truncate">{cli.nome}</span>
                  <span className="text-xs text-nevoa">
                    Nº {nFatura(f.numero)} · ref. {mesRef(f.referencia)} · vence {data(f.vencimento)}
                  </span>
                </span>
                <span className="text-right">
                  <span className={cx("block font-medium", f.status === "cancelada" && "text-nevoa line-through")}>{brl(Number(f.total_centavos))}</span>
                  <Status s={f.status as "pendente"} vencida={f.status === "pendente" && f.vencimento < hoje} />
                </span>
              </Link>
            );
          })}
        </Cartao>
      ) : (
        <Vazio titulo="Nenhuma fatura aqui" texto="Mude o filtro ou lance a conta de um cliente para emitir a primeira fatura." />
      )}
    </>
  );
}
