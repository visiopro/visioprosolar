import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { contexto } from "@/lib/usina";
import { brl, data, hojeBR, mesExtenso, mesRef, somarDias } from "@/lib/format";
import { ArcoSol } from "@/components/arco-sol";
import { BotaoLink, Cartao, Status, Vazio } from "@/components/ui";

function deslocarMes(ref: string, n: number) {
  const [a, m] = ref.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function Painel({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { supabase, usina } = await contexto();
  const hoje = hojeBR();
  const q = (await searchParams).mes;
  const mes = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : hoje.slice(0, 7);
  const ref = `${mes}-01`;
  const inicioSerie = `${deslocarMes(mes, -5)}-01`;

  const [{ data: faturas }, { data: clientes }, { data: vencendo }, { count: contasUrgentes }] = await Promise.all([
    supabase
      .from("faturas")
      .select("id, cliente_id, referencia, status, total_centavos, economia_centavos, custo_usina_centavos")
      .eq("usina_id", usina.id)
      .neq("status", "cancelada")
      .gte("referencia", inicioSerie)
      .lte("referencia", ref),
    supabase.from("clientes").select("id, nome, uc").eq("usina_id", usina.id).eq("ativo", true).order("nome"),
    supabase
      .from("faturas")
      .select("id, numero, vencimento, total_centavos, snapshot")
      .eq("usina_id", usina.id)
      .eq("status", "pendente")
      .lte("vencimento", somarDias(hoje, 7))
      .order("vencimento")
      .limit(6),
    supabase
      .from("despesas")
      .select("id", { count: "exact", head: true })
      .eq("usina_id", usina.id)
      .eq("categoria", "conta_distribuidora")
      .is("pago_em", null)
      .lte("vencimento", somarDias(hoje, 3)),
  ]);

  const doMes = (faturas ?? []).filter((f) => f.referencia === ref);
  const faturado = doMes.reduce((s, f) => s + Number(f.total_centavos), 0);
  const recebido = doMes.filter((f) => f.status === "paga").reduce((s, f) => s + Number(f.total_centavos), 0);
  const economia = doMes.reduce((s, f) => s + Number(f.economia_centavos), 0);
  const custo = doMes.reduce((s, f) => s + Number(f.custo_usina_centavos ?? 0), 0);
  const comFatura = new Set(doMes.map((f) => f.cliente_id));
  const semFatura = (clientes ?? []).filter((c) => !comFatura.has(c.id));

  const serie = Array.from({ length: 6 }, (_, i) => {
    const m = deslocarMes(mes, i - 5);
    const v = (faturas ?? []).filter((f) => f.referencia === `${m}-01`).reduce((s, f) => s + Number(f.total_centavos), 0);
    return { m, v };
  });
  const maior = Math.max(1, ...serie.map((s) => s.v));

  if (!clientes?.length) {
    return (
      <Vazio
        titulo="Comece cadastrando os clientes da usina"
        texto="Com os clientes cadastrados, é só fotografar a conta de energia de cada um para gerar a fatura."
        acao={<BotaoLink href="/clientes/novo">Cadastrar cliente</BotaoLink>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/?mes=${deslocarMes(mes, -1)}`} aria-label="Mês anterior" className="rounded-lg p-2 text-nevoa hover:text-texto">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold capitalize">{mesExtenso(ref)}</h1>
        <Link href={`/?mes=${deslocarMes(mes, 1)}`} aria-label="Próximo mês" className="rounded-lg p-2 text-nevoa hover:text-texto">
          <ChevronRight size={20} />
        </Link>
      </div>

      {contasUrgentes ? (
        <Link href="/financeiro" role="alert" className="block rounded-[var(--radius-cartao)] border border-erro/40 bg-erro/5 px-4 py-3 text-sm hover:bg-erro/10">
          <span className="font-medium text-erro">
            {contasUrgentes === 1 ? "1 conta da distribuidora vence" : `${contasUrgentes} contas da distribuidora vencem`} em até 3 dias ou já venceram.
          </span>{" "}
          <span className="text-nevoa">Ver no financeiro</span>
        </Link>
      ) : null}

      <Cartao className="flex flex-col items-center px-6 pb-6 pt-8">
        <ArcoSol fracao={faturado ? recebido / faturado : 0} />
        <p className="-mt-2 text-sm text-nevoa">Recebido de {brl(faturado)} faturados</p>
        <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight">{brl(recebido)}</p>
        <div className="mt-6 grid w-full grid-cols-3 border-t border-traco pt-5 text-center">
          <div className="min-w-0 px-1">
            <p className="text-base font-semibold sm:text-lg truncate">{brl(faturado - recebido)}</p>
            <p className="text-[10px] sm:text-xs text-nevoa">a receber</p>
          </div>
          <div className="border-x border-traco min-w-0 px-1">
            <p className="text-base font-semibold sm:text-lg">
              {doMes.length}/{clientes.length}
            </p>
            <p className="text-[10px] sm:text-xs text-nevoa">faturados</p>
          </div>
          <div className="min-w-0 px-1">
            <p className="text-base font-semibold text-economia sm:text-lg truncate">{brl(economia)}</p>
            <p className="text-[10px] sm:text-xs text-nevoa">economia</p>
          </div>
        </div>
        {custo > 0 ? (
          <p className="mt-5 w-full rounded-[var(--radius-campo)] bg-relevo px-3 py-3 text-center text-xs sm:text-sm text-nevoa leading-relaxed">
            Distribuidora: {brl(custo)} · Resultado{" "}
            <span className={faturado - custo >= 0 ? "font-semibold text-economia" : "font-semibold text-erro"}>{brl(faturado - custo)}</span>
          </p>
        ) : null}
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Falta lançar a conta</h2>
          {semFatura.length ? (
            <Cartao className="divide-y divide-traco">
              {semFatura.slice(0, 8).map((c) => (
                <Link key={c.id} href={`/contas/nova?cliente=${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-relevo/50">
                  <span className="min-w-0">
                    <span className="block truncate">{c.nome}</span>
                    <span className="text-xs text-nevoa">UC {c.uc}</span>
                  </span>
                  <span className="text-sm text-sol">Lançar</span>
                </Link>
              ))}
              {semFatura.length > 8 ? <p className="px-4 py-3 text-sm text-nevoa">E mais {semFatura.length - 8} clientes.</p> : null}
            </Cartao>
          ) : (
            <Cartao className="px-4 py-5 text-sm text-nevoa">Todos os clientes ativos já têm fatura neste mês.</Cartao>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Vencimentos da semana</h2>
          {vencendo?.length ? (
            <Cartao className="divide-y divide-traco">
              {vencendo.map((f) => (
                <Link key={f.id} href={`/faturas/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-relevo/50">
                  <span className="min-w-0">
                    <span className="block truncate">{(f.snapshot as { cliente: { nome: string } }).cliente.nome}</span>
                    <span className="text-xs text-nevoa">vence {data(f.vencimento)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {f.vencimento < hoje ? <Status s="pendente" vencida /> : null}
                    <span className="font-medium">{brl(Number(f.total_centavos))}</span>
                  </span>
                </Link>
              ))}
            </Cartao>
          ) : (
            <Cartao className="px-4 py-5 text-sm text-nevoa">Nenhuma fatura pendente vence nos próximos 7 dias.</Cartao>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Faturamento dos últimos 6 meses</h2>
        <Cartao className="overflow-x-auto px-3 pb-4 pt-6 sm:px-5">
          <div className="flex h-36 items-end gap-2 sm:gap-3" style={{ minWidth: "300px" }}>
            {serie.map((s) => (
              <div key={s.m} className="flex flex-1 flex-col items-center gap-1.5 sm:gap-2">
                <span className="whitespace-nowrap text-[10px] sm:text-[11px] text-nevoa">{s.v ? brl(s.v).replace(/,\d{2}$/, "") : ""}</span>
                <div
                  className={s.m === mes ? "w-full max-w-10 rounded-t-md bg-sol" : "w-full max-w-10 rounded-t-md bg-relevo"}
                  style={{ height: `${Math.max(3, (s.v / maior) * 96)}px` }}
                />
                <span className="whitespace-nowrap text-[10px] sm:text-xs text-nevoa">{mesRef(`${s.m}-01`)}</span>
              </div>
            ))}
          </div>
        </Cartao>
      </section>
    </div>
  );
}
