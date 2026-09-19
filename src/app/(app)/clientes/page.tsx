import Link from "next/link";
import { Search } from "lucide-react";
import { contexto } from "@/lib/usina";
import { MODOS, type ModoDesconto } from "@/lib/calculo";
import { numero } from "@/lib/format";
import { BotaoLink, Cabecalho, Cartao, Vazio } from "@/components/ui";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; inativos?: string }> }) {
  const { supabase, usina } = await contexto();
  const { q = "", inativos } = await searchParams;
  let consulta = supabase.from("clientes").select("id, nome, uc, distribuidora, modo_desconto, desconto_valor, ativo").eq("usina_id", usina.id).order("nome");
  if (!inativos) consulta = consulta.eq("ativo", true);
  const termo = q.trim().replace(/[%,()]/g, "");
  if (termo) consulta = consulta.or(`nome.ilike.%${termo}%,uc.ilike.%${termo}%`);
  const { data: clientes } = await consulta;

  return (
    <>
      <Cabecalho titulo="Clientes" sub={`${clientes?.length ?? 0} ${inativos ? "no total" : "ativos"}`} acao={<BotaoLink href="/clientes/novo">Novo cliente</BotaoLink>} />
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
            <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-relevo/50">
              <span className="min-w-0">
                <span className={`block truncate ${c.ativo ? "" : "text-nevoa line-through"}`}>{c.nome}</span>
                <span className="text-xs text-nevoa">
                  UC {c.uc} · {c.distribuidora}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm text-nevoa">
                {c.modo_desconto === "tarifa_fixa" ? `R$ ${numero(Number(c.desconto_valor), 4)}/kWh` : `${numero(Number(c.desconto_valor))}%`}
                <span className="block text-[11px]">{MODOS[c.modo_desconto as ModoDesconto].rotulo.replace("% ", "")}</span>
              </span>
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
