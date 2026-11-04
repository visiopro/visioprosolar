import Link from "next/link";
import { Search } from "lucide-react";
import { contexto } from "@/lib/usina";
import { MODOS, type ModoDesconto } from "@/lib/calculo";
import { numero } from "@/lib/format";
import { BotaoLink, Cabecalho, Cartao, Vazio } from "@/components/ui";
import { DispararBoasVindasLote } from "@/components/disparar-boas-vindas-lote";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; inativos?: string }> }) {
  const { supabase, usina } = await contexto();
  const { q = "", inativos } = await searchParams;
  let consulta = supabase
    .from("clientes")
    .select("id, nome, uc, distribuidora, modo_desconto, desconto_valor, ativo, boas_vindas_em, whatsapp, cadastro_automatico")
    .eq("usina_id", usina.id)
    .order("nome");
  if (!inativos) consulta = consulta.eq("ativo", true);
  const termo = q.trim().replace(/[%,()]/g, "");
  if (termo) consulta = consulta.or(`nome.ilike.%${termo}%,uc.ilike.%${termo}%`);

  const [{ data: clientes }, { count: pendentesCount }] = await Promise.all([
    consulta,
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("usina_id", usina.id)
      .eq("ativo", true)
      .is("boas_vindas_em", null)
      .not("whatsapp", "is", null),
  ]);

  return (
    <>
      <Cabecalho titulo="Clientes" sub={`${clientes?.length ?? 0} ${inativos ? "no total" : "ativos"}`} acao={<BotaoLink href="/clientes/novo">Novo cliente</BotaoLink>} />
      <DispararBoasVindasLote pendentesCount={pendentesCount ?? 0} />
      <form className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-nevoa" />
          <input name="q" defaultValue={q} placeholder="Buscar por nome ou UC" className="campo pl-9" />
        </div>
        <Link href={inativos ? "/clientes" : "/clientes?inativos=1"} className="self-center whitespace-nowrap text-sm text-nevoa hover:text-texto">
          {inativos ? "Só ativos" : "Ver inativos"}
        </Link>
      </form>

      {clientes?.length ? (
        <Cartao className="divide-y divide-traco">
          {clientes.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="group flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-relevo/50">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className={`truncate ${c.ativo ? "" : "text-nevoa line-through"}`}>{c.nome}</span>
                  {c.ativo && c.cadastro_automatico && (!c.whatsapp || c.nome.startsWith("UC ")) ? (
                    <span className="shrink-0 rounded bg-sol/15 px-1.5 py-0.5 text-[10px] font-medium text-sol">
                      Novo pela conta · completar cadastro
                    </span>
                  ) : null}
                  {c.ativo && !c.boas_vindas_em && c.whatsapp ? (
                    <span className="shrink-0 rounded bg-alerta/15 px-1.5 py-0.5 text-[10px] font-medium text-alerta">
                      Sem boas-vindas
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-nevoa">
                  UC {c.uc} · {c.distribuidora}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-right text-sm text-nevoa">
                  {c.modo_desconto === "tarifa_fixa" ? `R$ ${numero(Number(c.desconto_valor), 4)}/kWh` : `${numero(Number(c.desconto_valor))}%`}
                  <span className="block text-[11px]">{MODOS[c.modo_desconto as ModoDesconto].rotulo.replace("% ", "")}</span>
                </span>
                <span className="rounded-md border border-traco px-2 py-1 text-xs font-medium text-nevoa transition group-hover:border-nevoa group-hover:text-texto">
                  Editar
                </span>
              </div>
            </Link>
          ))}
        </Cartao>
      ) : termo ? (
        <Vazio titulo="Nenhum cliente encontrado" texto={`Nada com “${termo}”. Confira o nome ou a UC.`} />
      ) : (
        <Vazio
          titulo="Nenhum cliente ainda"
          texto="Cadastre cada cliente com a UC e a regra de desconto combinada."
          acao={<BotaoLink href="/clientes/novo">Cadastrar cliente</BotaoLink>}
        />
      )}
    </>
  );
}
