import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { exigirSuperAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brl, data, hojeBR, mesRef, nFatura } from "@/lib/format";
import { Cartao, Status } from "@/components/ui";
import { AdicionarOperador, Instancia, NovaSenha } from "@/components/admin";
import { segredos } from "@/lib/cobranca";

export const dynamic = "force-dynamic";

const NOMES: Record<string, string> = {
  fatura_emitida: "Fatura emitida",
  fatura_enviada: "Enviada no WhatsApp",
  fatura_paga: "Baixa manual",
  pagamento_asaas: "Pago (Asaas)",
  pagamento_mp: "Pago (Mercado Pago)",
  fatura_cancelada: "Fatura cancelada",
  cobranca_criada: "Cobrança criada",
  lembrete_enviado: "Lembrete enviado",
};

/** Acompanhamento de uma usina (somente leitura, exceto acessos e WhatsApp) */
export default async function UsinaAdmin({ params }: { params: Promise<{ id: string }> }) {
  await exigirSuperAdmin();
  const { id } = await params;
  const admin = supabaseAdmin();
  const hoje = hojeBR();
  const mes = `${hoje.slice(0, 7)}-01`;

  const [{ data: u }, { data: membros }, { count: clientes }, { data: faturas }, { data: eventos }, { data: usuarios }, { data: assinatura }, { data: mensalidades }] = await Promise.all([
    admin.from("usinas").select("*").eq("id", id).maybeSingle(),
    admin.from("usina_membros").select("user_id, email, papel").eq("usina_id", id),
    admin.from("clientes").select("*", { count: "exact", head: true }).eq("usina_id", id).eq("ativo", true),
    admin.from("faturas").select("id, numero, referencia, vencimento, status, total_centavos, snapshot").eq("usina_id", id).order("created_at", { ascending: false }).limit(15),
    admin.from("eventos").select("acao, created_at, user_id").eq("usina_id", id).order("created_at", { ascending: false }).limit(15),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("assinaturas").select("*").eq("usina_id", id).maybeSingle(),
    admin.from("assinatura_faturas").select("*").eq("usina_id", id).order("referencia", { ascending: false }).limit(10),
  ]);
  if (!u) notFound();
  const temToken = !!(await segredos(u.id).catch(() => null))?.evolutionToken;

  const acesso = new Map((usuarios?.users ?? []).map((x) => [x.id, x.last_sign_in_at]));
  const doMes = (faturas ?? []).filter((f) => f.referencia === mes && f.status !== "cancelada");
  const faturado = doMes.reduce((s, f) => s + Number(f.total_centavos), 0);
  const recebido = doMes.filter((f) => f.status === "paga").reduce((s, f) => s + Number(f.total_centavos), 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-nevoa hover:text-texto">
        <ChevronLeft size={16} /> Painel VisioPro
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{u.nome}</h1>
        <p className="text-sm text-nevoa">
          {u.documento ?? "sem documento"} · desde {data(u.created_at)} · cobrança{" "}
          {u.gateway === "nenhum" ? "manual" : u.gateway === "asaas" ? "Asaas" : "Mercado Pago"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "Clientes ativos", v: String(clientes ?? 0) },
          { r: "Faturas no mês", v: String(doMes.length) },
          { r: "Faturado no mês", v: brl(faturado) },
          { r: "Recebido no mês", v: brl(recebido) },
        ].map((m) => (
          <Cartao key={m.r} className="p-4">
            <p className="text-sm text-nevoa">{m.r}</p>
            <p className="mt-1 text-xl font-semibold">{m.v}</p>
          </Cartao>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Acessos</h2>
          <Cartao className="divide-y divide-traco">
            {(membros ?? []).map((m) => (
              <div key={m.user_id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{m.email}</span>
                    <span className="text-xs text-nevoa">
                      {m.papel === "dono" ? "Dono" : "Operador"} · último acesso {acesso.get(m.user_id) ? data(acesso.get(m.user_id)!) : "nunca"}
                    </span>
                  </span>
                </div>
                <NovaSenha userId={m.user_id} />
              </div>
            ))}
            <div className="px-4 py-3">
              <AdicionarOperador usinaId={u.id} />
            </div>
          </Cartao>

          <h2 className="mb-3 mt-6 font-semibold">WhatsApp</h2>
          <Cartao className="p-4">
            <Instancia usinaId={u.id} atual={u.whatsapp_instancia} temToken={temToken} />
            <p className="mt-2 text-xs text-nevoa">Sem token, usa a chave global (EVOLUTION_API_KEY). Envio automático ao emitir: {u.whatsapp_auto ? "ligado" : "desligado"}.</p>
          </Cartao>

          <h2 className="mb-3 mt-6 font-semibold">Mensalidade VisioPro (Assinatura)</h2>
          <Cartao className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-nevoa">Status da assinatura:</span>
              <span className={assinatura?.ativa ? "text-economia font-medium" : "text-alerta font-medium"}>
                {assinatura?.ativa ? "Ativa" : "Inativa"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-nevoa">
              <span>Faixas cadastradas:</span>
              <span>
                {brl(Number(assinatura?.preco_ate_30_centavos ?? 600))} (até 30) · {brl(Number(assinatura?.preco_acima_centavos ?? 800))} (acima)
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-nevoa">
              <span>Dias configurados:</span>
              <span>Geração: dia {assinatura?.dia_geracao ?? 1} · Vence: dia {assinatura?.dia_vencimento ?? 10}</span>
            </div>

            {mensalidades?.length ? (
              <div className="mt-2 divide-y divide-traco border-t border-traco pt-2">
                <p className="text-xs font-semibold text-nevoa mb-1.5">Últimas mensalidades geradas:</p>
                {mensalidades.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span>
                      {mesRef(m.referencia)} ({m.clientes_ativos} clientes)
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{brl(Number(m.valor_centavos))}</span>
                      <span className={m.status === "paga" ? "text-economia" : "text-alerta"}>
                        {m.status === "paga" ? "paga" : "pendente"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="border-t border-traco pt-2 text-xs text-nevoa">Nenhuma mensalidade emitida ainda.</p>
            )}
          </Cartao>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Últimas faturas</h2>
          {faturas?.length ? (
            <Cartao className="divide-y divide-traco">
              {faturas.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{(f.snapshot as { cliente: { nome: string } }).cliente.nome}</span>
                    <span className="text-xs text-nevoa">Nº {nFatura(f.numero)} · {mesRef(f.referencia)} · vence {data(f.vencimento)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span>{brl(Number(f.total_centavos))}</span>
                    <Status s={f.status as "pendente"} vencida={f.status === "pendente" && f.vencimento < hoje} />
                  </span>
                </div>
              ))}
            </Cartao>
          ) : (
            <Cartao className="p-4 text-sm text-nevoa">Nenhuma fatura ainda.</Cartao>
          )}

          <h2 className="mb-3 mt-6 font-semibold">Atividade recente</h2>
          <Cartao className="p-4">
            {eventos?.length ? (
              <ol className="space-y-2 text-sm">
                {eventos.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{NOMES[e.acao] ?? e.acao}</span>
                    <span className="shrink-0 text-xs text-nevoa">
                      {new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-nevoa">Sem atividade ainda.</p>
            )}
          </Cartao>
        </section>
      </div>
    </main>
  );
}
