import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brl, data, hojeBR, mesExtenso, mesRef, nFatura, numero } from "@/lib/format";
import { urlLogo } from "@/lib/usina";
import { descreverRegra, type ModoDesconto } from "@/lib/calculo";
import { ChatPortal, CopiarPix } from "@/components/portal";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: c } = await supabaseAdmin().from("clientes").select("usinas(nome)").eq("portal_token", token).maybeSingle();
  const usina = c?.usinas as unknown as { nome: string } | undefined;
  return { title: usina ? `Minhas faturas · ${usina.nome}` : "Minhas faturas", robots: { index: false, follow: false } };
}

/** Página pública do cliente final: faturas, PIX e economia */
export default async function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const admin = supabaseAdmin();

  const { data: cliente } = await admin
    .from("clientes")
    .select("id, nome, uc, distribuidora, usina_id, usinas(nome, logo_path, contato_whatsapp)")
    .eq("portal_token", token)
    .maybeSingle();
  if (!cliente) notFound();
  const usina = cliente.usinas as unknown as { nome: string; logo_path: string | null; contato_whatsapp: string | null };

  const { data: faturas } = await admin
    .from("faturas")
    .select("id, numero, referencia, vencimento, status, total_centavos, economia_centavos, sem_usina_centavos, pix_copia_cola, cobranca_link, paga_em, modo_desconto, desconto_valor, compensada_kwh, consumo_kwh, tarifa, bandeira_centavos, iluminacao_centavos, sem_usina_ajustado, valor_conta_centavos")
    .eq("cliente_id", cliente.id)
    .neq("status", "cancelada")
    .order("referencia", { ascending: false })
    .limit(12);

  const hoje = hojeBR();
  const lista = faturas ?? [];
  const atual = lista.find((f) => f.status === "pendente") ?? lista[0];
  const economia = lista.reduce((s, f) => s + Number(f.economia_centavos), 0);
  const qr = atual?.status === "pendente" && atual.pix_copia_cola ? await QRCode.toDataURL(atual.pix_copia_cola, { margin: 1, width: 360 }) : null;
  const logo = urlLogo(usina.logo_path);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-16 pt-[calc(env(safe-area-inset-top)+28px)]">
      <header className="flex items-center gap-3">
        {logo ? (
          <span className="grid h-14 w-20 shrink-0 place-items-center rounded-[var(--radius-campo)] bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={usina.nome} className="max-h-full max-w-full object-contain" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{usina.nome}</p>
          <p className="truncate text-sm text-nevoa">
            {cliente.nome} · UC {cliente.uc}
          </p>
        </div>
      </header>

      {!atual ? (
        <div className="mt-8 rounded-[var(--radius-cartao)] border border-traco bg-painel p-6 text-center">
          <p className="font-medium">Nenhuma fatura por aqui ainda</p>
          <p className="mt-1 text-sm text-nevoa">Assim que a primeira for emitida, ela aparece nesta página.</p>
        </div>
      ) : (
        <section className="mt-6 space-y-4">
          {/* Card principal */}
          <div className="rounded-[var(--radius-cartao)] border border-traco bg-painel p-6">
            <p className="text-sm capitalize text-nevoa">{mesExtenso(atual.referencia)}</p>
            {atual.status === "paga" ? (
              <>
                <p className="mt-2 text-3xl font-semibold text-economia">Fatura paga</p>
                <p className="mt-1 text-sm text-nevoa">
                  {brl(Number(atual.total_centavos))} · recebida em {data(atual.paga_em)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-nevoa line-through">Sem a usina: {brl(Number(atual.sem_usina_centavos))}</p>
                <p className="text-[40px] font-semibold leading-none tracking-tight">{brl(Number(atual.total_centavos))}</p>
                <p className={atual.vencimento < hoje ? "mt-2 text-sm text-erro" : "mt-2 text-sm text-nevoa"}>
                  {atual.vencimento < hoje ? "Venceu" : "Vence"} em {data(atual.vencimento)}
                </p>
              </>
            )}
          </div>

          {/* Economia destaque */}
          {Number(atual.economia_centavos) > 0 ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-cartao)] border border-economia/30 bg-economia/5 px-5 py-4">
              <span className="text-2xl">💰</span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-economia/70">Sua economia neste mês</p>
                <p className="text-xl font-semibold text-economia">{brl(Number(atual.economia_centavos))}</p>
              </div>
            </div>
          ) : null}

          {/* Detalhamento do cálculo */}
          <div className="rounded-[var(--radius-cartao)] border border-traco overflow-hidden">
            <div className="bg-[var(--color-noite,#0B1A30)] px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/90">Detalhamento do cálculo</p>
            </div>
            <DetalheCalculo fatura={atual} />
          </div>

          {/* PIX e ações de pagamento */}
          {atual.status === "pendente" ? (
            <>
              {qr ? (
                <div className="rounded-[var(--radius-campo)] bg-white p-4 text-center border border-traco">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR code do PIX" className="mx-auto h-44 w-44" />
                  <p className="mt-2 text-xs text-slate-600">Aponte a câmera do app do seu banco</p>
                </div>
              ) : null}
              {atual.pix_copia_cola ? <CopiarPix pix={atual.pix_copia_cola} /> : null}
              {atual.cobranca_link ? (
                <a
                  href={atual.cobranca_link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[var(--radius-campo)] border border-traco px-4 py-3 text-center hover:border-nevoa"
                >
                  Outras formas de pagamento
                </a>
              ) : null}
            </>
          ) : null}

          <a
            href={`/api/portal/${token}/${atual.id}/pdf`}
            target="_blank"
            className="block rounded-[var(--radius-campo)] border border-traco px-4 py-3 text-center hover:border-nevoa"
          >
            📄 Baixar a fatura em PDF
          </a>
        </section>
      )}

      {economia > 0 ? (
        <section className="mt-4 rounded-[var(--radius-cartao)] border border-economia/30 bg-economia/5 p-5 text-center">
          <p className="text-sm text-nevoa">Você já economizou com energia solar</p>
          <p className="mt-1 text-2xl font-semibold text-economia">{brl(economia)}</p>
        </section>
      ) : null}

      {lista.length > 1 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-nevoa">Faturas anteriores</h2>
          <div className="divide-y divide-traco rounded-[var(--radius-cartao)] border border-traco bg-painel">
            {lista.map((f) => (
              <a key={f.id} href={`/api/portal/${token}/${f.id}/pdf`} target="_blank" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-relevo/50">
                <span>
                  <span className="block text-sm">{mesRef(f.referencia)}</span>
                  <span className="text-xs text-nevoa">
                    Nº {nFatura(f.numero)} · economia {brl(Number(f.economia_centavos))}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm">{brl(Number(f.total_centavos))}</span>
                  <span className={f.status === "paga" ? "text-xs text-economia" : f.vencimento < hoje ? "text-xs text-erro" : "text-xs text-alerta"}>
                    {f.status === "paga" ? "paga" : f.vencimento < hoje ? "vencida" : "em aberto"}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <ChatPortal token={token} whatsappUsina={usina.contato_whatsapp} usina={usina.nome} />

      <p className="mt-8 text-center text-xs text-nevoa">
        A conta da distribuidora continua chegando normalmente. Dúvidas? Fale com {usina.nome}.
      </p>
    </main>
  );
}

/** Componente de detalhamento inline do cálculo da fatura */
function DetalheCalculo({ fatura: f }: {
  fatura: {
    modo_desconto: string;
    desconto_valor: number;
    consumo_kwh: number | null;
    compensada_kwh: number;
    tarifa: number;
    bandeira_centavos: number;
    iluminacao_centavos: number;
    sem_usina_centavos: number;
    sem_usina_ajustado: boolean;
    economia_centavos: number;
    total_centavos: number;
  };
}) {
  const modo = f.modo_desconto as ModoDesconto;
  const regra = descreverRegra(modo, Number(f.desconto_valor));
  const bandeira = Number(f.bandeira_centavos ?? 0);
  const ilum = Number(f.iluminacao_centavos ?? 0);
  const semUsina = Number(f.sem_usina_centavos);

  const linhas: [string, string, boolean?][] = [];

  if (modo === "percentual_conta_cheia") {
    if (f.sem_usina_ajustado) {
      linhas.push([`Conta de energia (${numero(Number(f.consumo_kwh ?? 0))} kWh)`, brl(semUsina)]);
    } else {
      linhas.push(["Consumo do mês", `${numero(Number(f.consumo_kwh ?? 0))} kWh`]);
      linhas.push(["Tarifa da distribuidora", `R$ ${numero(Number(f.tarifa), 8)}/kWh`]);
      linhas.push(["Energia (consumo × tarifa)", brl(semUsina - bandeira - ilum)]);
      if (bandeira > 0) linhas.push(["Bandeira tarifária", brl(bandeira)]);
      if (ilum > 0) linhas.push(["Iluminação pública", brl(ilum)]);
      linhas.push(["Conta sem a usina", brl(semUsina), true]);
    }
  } else {
    linhas.push(["Energia recebida da usina", `${numero(Number(f.compensada_kwh))} kWh`]);
    linhas.push(["Tarifa da distribuidora", `R$ ${numero(Number(f.tarifa), 8)}/kWh`]);
    linhas.push(["Sem a usina", brl(semUsina)]);
  }

  return (
    <div className="divide-y divide-traco">
      {linhas.map(([label, value, bold], i) => (
        <div key={i} className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${i % 2 === 0 ? "bg-painel" : "bg-relevo/30"}`}>
          <span className={`text-nevoa ${bold ? "font-semibold text-tinta" : ""}`}>{label}</span>
          <span className={bold ? "font-semibold" : ""}>{value}</span>
        </div>
      ))}
      {/* Economia */}
      <div className="flex justify-between gap-4 px-4 py-2.5 text-sm bg-economia/5">
        <span className="font-semibold text-economia">{regra}</span>
        <span className="font-semibold text-economia">- {brl(Number(f.economia_centavos))}</span>
      </div>
      {/* Total */}
      <div className="flex justify-between gap-4 px-4 py-3 text-sm bg-relevo/50">
        <span className="font-bold">Total da fatura</span>
        <span className="font-bold text-lg">{brl(Number(f.total_centavos))}</span>
      </div>
    </div>
  );
}
