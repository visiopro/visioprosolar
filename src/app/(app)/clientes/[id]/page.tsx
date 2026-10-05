import Link from "next/link";
import { notFound } from "next/navigation";
import { contexto } from "@/lib/usina";
import { brl, data, hojeBR, mesRef, nFatura } from "@/lib/format";
import { alternarCliente } from "../../actions";
import { FormCliente } from "@/components/form-cliente";
import { BotaoExcluirCliente } from "@/components/botao-excluir-cliente";
import { BotaoBoasVindasManual } from "@/components/botao-boas-vindas-manual";
import { LinkPortal } from "@/components/portal";
import { linkPortal } from "@/lib/faturas";
import { Botao, Cabecalho, Cartao, Status } from "@/components/ui";
import type { ModoDesconto } from "@/lib/calculo";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await contexto();
  const [{ data: c }, { data: faturas }, { data: tabelas }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
    supabase.from("faturas").select("id, numero, referencia, vencimento, status, total_centavos, economia_centavos").eq("cliente_id", id).order("referencia", { ascending: false }).limit(24),
    supabase.from("cip_tabelas").select("id, municipio, uf").order("municipio"),
  ]);
  if (!c) notFound();
  const hoje = hojeBR();
  const economia = (faturas ?? []).filter((f) => f.status !== "cancelada").reduce((s, f) => s + Number(f.economia_centavos), 0);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <Cabecalho titulo={c.nome} sub={`UC ${c.uc}${c.ativo ? "" : " · inativo"}`} />
        <Cartao className="p-5 sm:p-6">
          <FormCliente c={{ ...c, modo_desconto: c.modo_desconto as ModoDesconto, desconto_valor: Number(c.desconto_valor), cip_modo: c.cip_modo, cip_valor: Number(c.cip_valor ?? 0), cip_tabela_id: c.cip_tabela_id, cip_classe: c.cip_classe }}
            tabelas={tabelas ?? []} />
        </Cartao>
        <div className="mt-6 rounded-[var(--radius-cartao)] border border-traco bg-painel p-5">
          <h3 className="text-sm font-semibold">Ações da conta</h3>
          <p className="mt-1 text-xs text-nevoa">
            {c.ativo
              ? "Inative para pausar novos lançamentos sem perder o histórico, ou exclua se o cadastro tiver sido feito por engano."
              : "Este cliente está inativo. Você pode reativá-lo para voltar a emitir faturas ou excluí-lo definitivamente caso não possua faturas."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={alternarCliente.bind(null, c.id, !c.ativo)}>
              <Botao variante={c.ativo ? "secundario" : "primario"} type="submit">
                {c.ativo ? "Inativar cliente" : "Reativar cliente"}
              </Botao>
            </form>
            <BotaoExcluirCliente id={c.id} nome={c.nome} />
          </div>
        </div>
      </div>

      <aside>
        <Cartao className="mb-4 p-5">
          <p className="text-sm text-nevoa">Economia acumulada</p>
          <p className="mt-1 text-2xl font-semibold text-economia">{brl(economia)}</p>
        </Cartao>
        <Cartao className="mb-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Boas-vindas</h3>
            {c.boas_vindas_em ? (
              <span className="rounded-md bg-economia/12 px-2 py-0.5 text-xs font-medium text-economia">
                Enviada
              </span>
            ) : (
              <span className="rounded-md bg-alerta/12 px-2 py-0.5 text-xs font-medium text-alerta">
                Pendente
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-nevoa">
            {c.boas_vindas_em
              ? `Mensagem enviada no WhatsApp em ${data(c.boas_vindas_em)}.`
              : "Apresenta a usina ao cliente, explica a primeira fatura e envia o link do portal."}
          </p>
          <div className="mt-3.5">
            <BotaoBoasVindasManual
              clienteId={c.id}
              enviadaEm={c.boas_vindas_em}
              temWhatsapp={Boolean(c.whatsapp)}
            />
          </div>
        </Cartao>

        <Cartao className="mb-4 p-5">
          <p className="mb-2 text-sm text-nevoa">Portal do cliente</p>
          <LinkPortal url={linkPortal(c.portal_token)} whatsapp={c.whatsapp} />
          <p className="mt-2 text-xs text-nevoa">Link fixo: o cliente vê as faturas dele, o PIX e a economia. Já vai junto com a fatura no WhatsApp.</p>
        </Cartao>

        <h2 className="mb-3 font-semibold">Faturas</h2>
        {faturas?.length ? (
          <Cartao className="divide-y divide-traco">
            {faturas.map((f) => (
              <Link key={f.id} href={`/faturas/${f.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-relevo/50">
                <span>
                  <span className="block">{mesRef(f.referencia)}</span>
                  <span className="text-xs text-nevoa">
                    Nº {nFatura(f.numero)} · vence {data(f.vencimento)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-medium">{brl(Number(f.total_centavos))}</span>
                  <Status s={f.status as "pendente"} vencida={f.status === "pendente" && f.vencimento < hoje} />
                </span>
              </Link>
            ))}
          </Cartao>
        ) : (
          <Cartao className="p-4 text-sm text-nevoa">Nenhuma fatura emitida.</Cartao>
        )}
      </aside>
    </div>
  );
}
