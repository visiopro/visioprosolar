import QRCode from "qrcode";
import { CheckCircle2, AlertCircle, Calendar, Users, HelpCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { contexto } from "@/lib/usina";
import { detalharMensalidade } from "@/lib/assinatura";
import { brl, data, hojeBR, mesRef } from "@/lib/format";
import { Cabecalho, Cartao, Status } from "@/components/ui";
import { CopiarPix } from "@/components/portal";

export const dynamic = "force-dynamic";

export default async function AssinaturaPage() {
  const { supabase, usina, papel } = await contexto();

  const [{ data: assinatura }, { count: clientesAtivos }, { data: faturas }] = await Promise.all([
    supabase.from("assinaturas").select("*").eq("usina_id", usina.id).maybeSingle(),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("usina_id", usina.id).eq("ativo", true),
    supabase.from("assinatura_faturas").select("*").eq("usina_id", usina.id).order("referencia", { ascending: false }),
  ]);

  const hoje = hojeBR();
  const qtdClientes = clientesAtivos ?? 0;

  const precos = {
    preco_ate_30_centavos: Number(assinatura?.preco_ate_30_centavos ?? 600),
    preco_acima_centavos: Number(assinatura?.preco_acima_centavos ?? 800),
    minimo_centavos: Number(assinatura?.minimo_centavos ?? 0),
  };

  const detalhesAtual = detalharMensalidade(qtdClientes, precos);
  const listaFaturas = faturas ?? [];
  const faturaPendente = listaFaturas.find((f) => f.status === "pendente");

  const qrPix =
    faturaPendente?.pix_copia_cola
      ? await QRCode.toDataURL(faturaPendente.pix_copia_cola, { margin: 1, width: 360 })
      : null;

  return (
    <div className="max-w-4xl space-y-8">
      <Cabecalho
        titulo="Assinatura VisioPro"
        sub="Mensalidade do sistema por clientes ativos da usina"
      />

      {/* Destaque de Fatura Aberta ou Situação em Dia */}
      {faturaPendente ? (
        <section>
          <div className="rounded-[var(--radius-cartao)] border border-alerta/40 bg-alerta/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-traco pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-alerta">
                  <AlertCircle size={15} /> Mensalidade em aberto
                </span>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Competência: {mesRef(faturaPendente.referencia)}
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs text-nevoa">Valor da mensalidade</span>
                <p className="text-3xl font-extrabold text-texto">
                  {brl(Number(faturaPendente.valor_centavos))}
                </p>
                <p className={faturaPendente.vencimento < hoje ? "text-xs text-erro" : "text-xs text-nevoa"}>
                  {faturaPendente.vencimento < hoje ? "Venceu em " : "Vencimento em "}
                  {data(faturaPendente.vencimento)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Instruções de pagamento</p>
                <p className="mt-1 text-xs text-nevoa leading-relaxed">
                  Pague com PIX para liberação e baixa instantâneas. Escaneie o QR Code no app do seu banco ou copie o código PIX.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="rounded-[var(--radius-campo)] border border-traco bg-painel p-3.5 text-xs text-nevoa space-y-1">
                    <p>• Clientes faturados nesta competência: <strong className="text-texto">{faturaPendente.clientes_ativos}</strong></p>
                    <p>• Baixa automática confirmada pelo Mercado Pago</p>
                  </div>

                  {faturaPendente.pix_copia_cola ? (
                    <CopiarPix pix={faturaPendente.pix_copia_cola} />
                  ) : null}

                  {(faturaPendente.cobranca_link || faturaPendente.asaas_link) ? (
                    <a
                      href={(faturaPendente.cobranca_link || faturaPendente.asaas_link)!}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-campo)] border border-traco bg-relevo px-4 py-3 text-sm font-medium hover:border-nevoa"
                    >
                      <ExternalLink size={16} /> Pagar com Mercado Pago / Cartão
                    </a>
                  ) : null}
                </div>
              </div>

              {qrPix ? (
                <div className="flex flex-col items-center justify-center rounded-[var(--radius-campo)] bg-white p-6 text-center text-noite">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrPix} alt="QR Code PIX da mensalidade" className="h-44 w-44" />
                  <p className="mt-2 text-xs font-semibold text-slate-700">QR Code PIX</p>
                  <p className="text-[11px] text-slate-500">Aponte a câmera do aplicativo do seu banco</p>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-[var(--radius-campo)] border border-dashed border-traco p-6 text-center text-xs text-nevoa">
                  Aguardando geração do PIX pelo Mercado Pago.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section>
          <Cartao className="flex items-center gap-4 p-5 sm:p-6 border-economia/30 bg-economia/5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-economia/20 text-economia">
              <CheckCircle2 size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-texto">Sua assinatura está em dia</h2>
              <p className="mt-0.5 text-xs text-nevoa">
                Não constam mensalidades pendentes para a sua usina. A próxima mensalidade será gerada automaticamente no dia {assinatura?.dia_geracao ?? 1}.
              </p>
            </div>
          </Cartao>
        </section>
      )}

      {/* Regras do Plano e Clientes Ativos */}
      <section className="space-y-3">
        <h2 className="font-semibold">Plano da Usina</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Cartao className="p-4 space-y-1">
            <span className="flex items-center gap-2 text-xs text-nevoa">
              <Users size={16} /> Clientes Ativos
            </span>
            <p className="text-2xl font-bold">{qtdClientes}</p>
            <p className="text-xs text-nevoa">cadastrados e ativos hoje</p>
          </Cartao>

          <Cartao className="p-4 space-y-1">
            <span className="flex items-center gap-2 text-xs text-nevoa">
              <ShieldCheck size={16} /> Previsão Mensalidade
            </span>
            <p className="text-2xl font-bold text-sol">{brl(detalhesAtual.total)}</p>
            <p className="text-xs text-nevoa">com base na carteira atual</p>
          </Cartao>

          <Cartao className="p-4 space-y-1">
            <span className="flex items-center gap-2 text-xs text-nevoa">
              <Calendar size={16} /> Datas de Cobrança
            </span>
            <p className="text-sm font-semibold">Geração: dia {assinatura?.dia_geracao ?? 1}</p>
            <p className="text-xs text-nevoa">Vencimento: dia {assinatura?.dia_vencimento ?? 10}</p>
          </Cartao>
        </div>

        <Cartao className="p-5 text-sm space-y-3">
          <div className="flex items-center justify-between border-b border-traco pb-3">
            <span className="text-nevoa">Faixa até 30 clientes</span>
            <span className="font-semibold">{brl(precos.preco_ate_30_centavos)} / cliente</span>
          </div>
          <div className="flex items-center justify-between border-b border-traco pb-3">
            <span className="text-nevoa">Faixa a partir do 31º cliente</span>
            <span className="font-semibold">{brl(precos.preco_acima_centavos)} / cliente</span>
          </div>
          {precos.minimo_centavos > 0 ? (
            <div className="flex items-center justify-between border-b border-traco pb-3">
              <span className="text-nevoa">Valor mínimo mensal</span>
              <span className="font-semibold">{brl(precos.minimo_centavos)}</span>
            </div>
          ) : null}
          <div className="pt-1 flex items-center justify-between font-medium">
            <span className="text-nevoa">Cálculo detalhado atual ({qtdClientes} clientes)</span>
            <span>
              {detalhesAtual.ate} × {brl(precos.preco_ate_30_centavos)}
              {detalhesAtual.acima > 0 ? ` + ${detalhesAtual.acima} × ${brl(precos.preco_acima_centavos)}` : ""}
              {" = "}
              <strong className="text-sol">{brl(detalhesAtual.total)}</strong>
            </span>
          </div>
        </Cartao>
      </section>

      {/* Histórico de Mensalidades */}
      <section className="space-y-3">
        <h2 className="font-semibold">Histórico de Mensalidades</h2>
        {listaFaturas.length ? (
          <Cartao className="divide-y divide-traco">
            {listaFaturas.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="font-semibold text-[15px]">{mesRef(f.referencia)}</p>
                    <Status
                      s={f.status as "pendente" | "paga" | "cancelada"}
                      vencida={f.status === "pendente" && f.vencimento < hoje}
                    />
                  </div>
                  <p className="mt-1 text-xs text-nevoa">
                    {f.clientes_ativos} cliente{f.clientes_ativos === 1 ? "" : "s"} faturado{f.clientes_ativos === 1 ? "" : "s"} · Venceu em {data(f.vencimento)}
                    {f.paga_em ? ` · Pago em ${data(f.paga_em)}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold text-base">{brl(Number(f.valor_centavos))}</p>
                    {f.paga_em ? (
                      <span className="text-xs text-economia font-medium">Confirmado</span>
                    ) : (
                      <span className={f.vencimento < hoje ? "text-xs text-erro font-medium" : "text-xs text-alerta font-medium"}>
                        {f.vencimento < hoje ? "Em atraso" : "Aguardando"}
                      </span>
                    )}
                  </div>

                  {f.status === "pendente" && (f.cobranca_link || f.asaas_link) ? (
                    <a
                      href={(f.cobranca_link || f.asaas_link)!}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[var(--radius-campo)] border border-traco bg-relevo px-3 py-1.5 text-xs text-sol hover:border-sol"
                    >
                      Pagar
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </Cartao>
        ) : (
          <Cartao className="p-6 text-center text-sm text-nevoa">
            Nenhuma mensalidade emitida ainda. As mensalidades são geradas automaticamente todo mês.
          </Cartao>
        )}
      </section>

      {/* Suporte VisioPro */}
      <section>
        <Cartao className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <HelpCircle size={20} className="text-nevoa shrink-0" />
            <div>
              <p className="text-sm font-medium">Dúvidas sobre sua assinatura?</p>
              <p className="text-xs text-nevoa">Entre em contato com o suporte da VisioPro para tirar dúvidas ou ajustar seu plano.</p>
            </div>
          </div>
          <a
            href="https://wa.me/5577999999999?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20a%20assinatura%20da%20minha%20usina."
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm text-sol hover:underline"
          >
            Falar no WhatsApp
          </a>
        </Cartao>
      </section>
    </div>
  );
}
