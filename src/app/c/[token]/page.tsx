import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Download, ExternalLink, SunMedium, CheckCircle2, AlertCircle } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brl, data, hojeBR, mesRef, nFatura } from "@/lib/format";
import { urlLogo } from "@/lib/usina";
import { Cartao, Status } from "@/components/ui";
import { CopiarPix } from "@/components/portal";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PortalCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const admin = supabaseAdmin();
  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nome, uc, usina_id")
    .eq("portal_token", token)
    .maybeSingle();

  if (!cliente) notFound();

  const [{ data: usina }, { data: faturas }] = await Promise.all([
    admin.from("usinas").select("id, nome, logo_path").eq("id", cliente.usina_id).maybeSingle(),
    admin
      .from("faturas")
      .select("id, numero, referencia, vencimento, total_centavos, economia_centavos, status, pix_copia_cola, cobranca_link")
      .eq("cliente_id", cliente.id)
      .neq("status", "cancelada")
      .order("referencia", { ascending: false })
      .limit(12),
  ]);

  const lista = faturas ?? [];
  const faturaAtual = lista[0];
  const hoje = hojeBR();
  const economiaTotal = lista.reduce((s, f) => s + Number(f.economia_centavos ?? 0), 0);

  let qrCode: string | null = null;
  if (faturaAtual?.pix_copia_cola && faturaAtual.status === "pendente") {
    try {
      qrCode = await QRCode.toDataURL(faturaAtual.pix_copia_cola, { margin: 1, width: 280 });
    } catch {
      qrCode = null;
    }
  }

  const logo = usina?.logo_path ? urlLogo(usina.logo_path) : null;
  const primeiroNome = cliente.nome.split(" ")[0];

  return (
    <main className="min-h-screen bg-fundo px-4 py-8 text-texto sm:py-12">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Cabeçalho da Usina */}
        <header className="flex items-center justify-between border-b border-traco pb-5">
          <div className="flex items-center gap-3">
            {logo ? (
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-traco bg-relevo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={usina?.nome ?? "Usina"} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sol/10 text-sol">
                <SunMedium size={22} />
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-nevoa">Energia Solar</p>
              <h1 className="font-semibold">{usina?.nome ?? "VisioPro Solar"}</h1>
            </div>
          </div>
          <span className="rounded-md border border-traco bg-relevo px-2.5 py-1 text-xs text-nevoa">
            UC {cliente.uc}
          </span>
        </header>

        {/* Saudação e Economia */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Olá, {primeiroNome}!</h2>
            <p className="text-sm text-nevoa">Acompanhe suas faturas e a economia gerada.</p>
          </div>
          {economiaTotal > 0 ? (
            <div className="rounded-[var(--radius-campo)] border border-economia/25 bg-economia/10 px-3.5 py-2 text-right">
              <span className="block text-xs font-medium text-economia">Economia acumulada</span>
              <span className="text-lg font-bold text-economia">{brl(economiaTotal)}</span>
            </div>
          ) : null}
        </div>

        {/* Fatura Principal / Atual */}
        {faturaAtual ? (
          <Cartao className="overflow-hidden p-6">
            <div className="flex items-start justify-between gap-3 border-b border-traco pb-4">
              <div>
                <span className="text-xs text-nevoa">Competência {mesRef(faturaAtual.referencia)}</span>
                <p className="text-lg font-semibold">Fatura nº {nFatura(faturaAtual.numero)}</p>
              </div>
              <Status s={faturaAtual.status} vencida={faturaAtual.status === "pendente" && faturaAtual.vencimento < hoje} />
            </div>

            <div className="my-5 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <span className="text-xs text-nevoa">Valor a pagar</span>
                <p className="text-3xl font-bold tracking-tight text-sol">{brl(faturaAtual.total_centavos)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-nevoa">Vencimento</span>
                <p className={`text-base font-semibold ${faturaAtual.status === "pendente" && faturaAtual.vencimento < hoje ? "text-erro" : ""}`}>
                  {data(faturaAtual.vencimento)}
                </p>
              </div>
            </div>

            {faturaAtual.economia_centavos > 0 ? (
              <div className="mb-5 flex items-center justify-between rounded-lg bg-economia/10 px-4 py-2.5 text-sm text-economia">
                <span>Economia desta fatura</span>
                <span className="font-semibold">{brl(faturaAtual.economia_centavos)}</span>
              </div>
            ) : null}

            {/* PIX para pagamento pendente */}
            {faturaAtual.status === "pendente" && faturaAtual.pix_copia_cola ? (
              <div className="mt-4 rounded-[var(--radius-campo)] border border-traco bg-noite/70 p-4 text-center">
                {qrCode ? (
                  <div className="mx-auto my-2 flex w-fit justify-center rounded-lg bg-white p-3">
                    <img src={qrCode} alt="QR Code Pix" className="h-44 w-44" />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-nevoa">Escaneie o QR Code ou copie o código abaixo para pagar via PIX.</p>
                <CopiarPix pix={faturaAtual.pix_copia_cola} />
              </div>
            ) : faturaAtual.status === "paga" ? (
              <div className="my-4 flex items-center justify-center gap-2 rounded-[var(--radius-campo)] border border-economia/30 bg-economia/10 py-3 font-semibold text-economia">
                <CheckCircle2 size={18} /> Fatura confirmada e paga
              </div>
            ) : null}

            {/* Links de ação */}
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <a
                href={`/api/portal/${token}/pdf?fatura=${faturaAtual.id}&baixar=1`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-campo)] border border-traco bg-relevo px-4 py-2.5 text-sm font-medium hover:border-nevoa"
              >
                <Download size={16} /> Baixar PDF
              </a>
              {faturaAtual.status === "pendente" && faturaAtual.cobranca_link ? (
                <a
                  href={faturaAtual.cobranca_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-campo)] border border-sol/40 bg-sol/10 px-4 py-2.5 text-sm font-medium text-sol hover:bg-sol/15"
                >
                  <ExternalLink size={16} /> Pagar com cartão / boleto
                </a>
              ) : null}
            </div>
          </Cartao>
        ) : (
          <Cartao className="p-8 text-center text-nevoa">
            <p className="text-sm">Nenhuma fatura emitida no momento.</p>
          </Cartao>
        )}

        {/* Histórico das últimas faturas */}
        {lista.length > 1 ? (
          <section className="space-y-3">
            <h3 className="font-semibold">Histórico de faturas</h3>
            <Cartao className="divide-y divide-traco/60">
              {lista.slice(1).map((f) => (
                <div key={f.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <span className="font-medium">{mesRef(f.referencia)}</span>
                    <span className="ml-2 text-xs text-nevoa">venc. {data(f.vencimento)}</span>
                    <p className="text-xs text-nevoa">
                      {brl(f.total_centavos)} {f.economia_centavos > 0 ? `· econ. ${brl(f.economia_centavos)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Status s={f.status} vencida={f.status === "pendente" && f.vencimento < hoje} />
                    <a
                      href={`/api/portal/${token}/pdf?fatura=${f.id}&baixar=1`}
                      title="Baixar PDF"
                      className="rounded p-1.5 text-nevoa hover:bg-relevo hover:text-texto"
                    >
                      <Download size={16} />
                    </a>
                  </div>
                </div>
              ))}
            </Cartao>
          </section>
        ) : null}

        {/* Rodapé informativo */}
        <footer className="text-center text-xs text-nevoa/70">
          <p>Portal exclusivo de autoatendimento · {usina?.nome ?? "VisioPro Solar"}</p>
        </footer>
      </div>
    </main>
  );
}
