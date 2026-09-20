import { notFound } from "next/navigation";
import { contexto } from "@/lib/usina";

export const maxDuration = 60;
import { brl, data, hojeBR, mesExtenso, nFatura, numero } from "@/lib/format";
import { descreverRegra, type ModoDesconto } from "@/lib/calculo";
import { Cartao, Status } from "@/components/ui";
import { AcoesFatura } from "@/components/acoes-fatura";

const NOMES_EVENTO: Record<string, string> = {
  fatura_emitida: "Emitida",
  fatura_enviada: "Enviada no WhatsApp",
  lembrete_enviado: "Lembrete enviado",
  fatura_paga: "Marcada como paga",
  pagamento_desfeito: "Pagamento desfeito",
  fatura_cancelada: "Cancelada",
  cobranca_asaas: "Cobrança criada no Asaas",
  cobranca_criada: "Cobrança automática criada",
  pagamento_mp: "Pagamento confirmado pelo Mercado Pago",
  estorno_mp: "Pagamento estornado no Mercado Pago",
  pagamento_asaas: "Pagamento confirmado pelo Asaas",
  estorno_asaas: "Pagamento estornado no Asaas",
};

export default async function Fatura({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, usina } = await contexto();
  const [{ data: f }, { data: eventos }] = await Promise.all([
    supabase.from("faturas").select("*, clientes(whatsapp), contas_energia(arquivo_path)").eq("id", id).maybeSingle(),
    supabase.from("eventos").select("acao, created_at, detalhes").eq("alvo_id", id).order("created_at"),
  ]);
  if (!f) notFound();

  const hoje = hojeBR();
  const cli = (f.snapshot as { cliente: { nome: string; uc: string; distribuidora: string } }).cliente;
  const modo = f.modo_desconto as ModoDesconto;
  const conta = f.contas_energia as { arquivo_path: string } | null;
  const urlConta = conta ? (await supabase.storage.from("contas").createSignedUrl(conta.arquivo_path, 600)).data?.signedUrl : null;
  const whats = (f.clientes as { whatsapp: string | null } | null)?.whatsapp;

  const contaCheia = modo === "percentual_conta_cheia";
  const bandeira = Number(f.bandeira_centavos ?? 0);
  const ilum = Number(f.iluminacao_centavos ?? 0);
  const semUsina = Number(f.sem_usina_centavos);
  const linhas: [string, string][] = contaCheia
    ? f.sem_usina_ajustado
      ? [
          ["Consumo do mês", `${numero(Number(f.consumo_kwh ?? 0))} kWh`],
          ["Conta sem a usina (ajustada manualmente)", brl(semUsina)],
        ]
      : [
          ["Consumo do mês", `${numero(Number(f.consumo_kwh ?? 0))} kWh`],
          ["Tarifa da distribuidora", `R$ ${numero(Number(f.tarifa), 8)}/kWh`],
          ["Energia (consumo × tarifa)", brl(semUsina - bandeira - ilum)],
          ["Bandeira tarifária", brl(bandeira)],
          ["Iluminação pública", brl(ilum)],
          ["Conta sem a usina", brl(semUsina)],
        ]
    : [
        ["Energia compensada", `${numero(Number(f.compensada_kwh))} kWh`],
        ["Tarifa da distribuidora", `R$ ${numero(Number(f.tarifa), 8)}/kWh`],
        ["Sem a usina", brl(semUsina)],
      ];
  linhas.push([descreverRegra(modo, Number(f.desconto_valor)), `- ${brl(Number(f.economia_centavos))}`]);
  const custo = Number(f.custo_usina_centavos ?? 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <p className="text-sm text-nevoa">
          Fatura Nº {nFatura(f.numero)} · <span className="capitalize">{mesExtenso(f.referencia)}</span>
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">{cli.nome}</h1>
        <p className="mt-1 text-sm text-nevoa">
          UC {cli.uc} · {cli.distribuidora}
        </p>

        <Cartao className="mt-6 overflow-hidden">
          <div className="grid sm:grid-cols-[1.3fr_1fr]">
            <div className="p-6">
              <div className="flex items-center gap-2">
                <Status s={f.status as "pendente"} vencida={f.status === "pendente" && f.vencimento < hoje} />
                <span className="text-sm text-nevoa">vence {data(f.vencimento)}</span>
              </div>
              <p className="mt-4 text-sm text-nevoa line-through">{brl(Number(f.sem_usina_centavos))}</p>
              <p className="text-[42px] font-semibold leading-none tracking-tight">{brl(Number(f.total_centavos))}</p>
            </div>
            <div className="border-t border-traco bg-economia/5 p-6 sm:border-l sm:border-t-0">
              <p className="text-sm text-nevoa">Economia do cliente</p>
              <p className="mt-1 text-2xl font-semibold text-economia">{brl(Number(f.economia_centavos))}</p>
            </div>
          </div>
          <dl className="divide-y divide-traco border-t border-traco">
            {linhas.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-6 py-3 text-sm">
                <dt className="text-nevoa">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Cartao>

        {contaCheia && custo > 0 ? (
          <Cartao className="mt-4 flex items-center justify-between gap-4 px-6 py-4 text-sm">
            <span className="text-nevoa">
              Só você vê: conta paga à distribuidora {brl(custo)}
            </span>
            <span>
              Resultado{" "}
              <span className={Number(f.total_centavos) - custo >= 0 ? "font-medium text-economia" : "font-medium text-erro"}>
                {brl(Number(f.total_centavos) - custo)}
              </span>
            </span>
          </Cartao>
        ) : null}

        {f.status === "paga" ? (
          <p className="mt-4 text-sm text-economia">
            Paga em {data(f.paga_em)}
            {f.pagamento_origem === "asaas" ? " · baixa automática pelo Asaas" : f.pagamento_origem === "mercadopago" ? " · baixa automática pelo Mercado Pago" : f.pagamento_origem === "manual" ? " · baixa manual" : ""}
            {f.taxa_centavos ? ` · taxa ${brl(Number(f.taxa_centavos))}` : ""}
          </p>
        ) : null}

        {f.status === "cancelada" ? (
          <p className="mt-4 text-sm text-nevoa">
            Cancelada em {data(f.cancelada_em)}. Motivo: {f.motivo_cancelamento}
          </p>
        ) : null}
      </div>

      <aside className="space-y-6">
        <AcoesFatura
          id={f.id}
          status={f.status}
          pix={f.pix_copia_cola}
          podeEnviar={!!usina.whatsapp_instancia && !!whats}
          urlConta={urlConta ?? null}
          gatewayAtivo={usina.gateway !== "nenhum"}
          cobrancaId={f.cobranca_id}
          cobrancaLink={f.cobranca_link}
          cobrancaGateway={f.cobranca_gateway}
        />
        <section>
          <h2 className="mb-3 text-sm font-semibold">Histórico</h2>
          <ol className="space-y-2.5 border-l border-traco pl-4 text-sm">
            {(eventos ?? []).map((e, i) => (
              <li key={i}>
                <span className="block">{NOMES_EVENTO[e.acao] ?? e.acao}</span>
                <span className="text-xs text-nevoa">{new Date(e.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
