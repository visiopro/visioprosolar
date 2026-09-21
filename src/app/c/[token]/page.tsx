import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { brl, data, hojeBR, mesExtenso, mesRef, nFatura } from "@/lib/format";
import { urlLogo } from "@/lib/usina";
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
    .select("id, numero, referencia, vencimento, status, total_centavos, economia_centavos, sem_usina_centavos, pix_copia_cola, cobranca_link, paga_em")
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
        <section className="mt-6 rounded-[var(--radius-cartao)] border border-traco bg-painel p-6">
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
              {qr ? (
                <div className="mt-5 rounded-[var(--radius-campo)] bg-white p-4 text-center">
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
                  className="mt-2 block rounded-[var(--radius-campo)] border border-traco px-4 py-3 text-center hover:border-nevoa"
                >
                  Outras formas de pagamento
                </a>
              ) : null}
            </>
          )}
          <a
            href={`/api/portal/${token}/${atual.id}/pdf`}
            target="_blank"
            className="mt-2 block rounded-[var(--radius-campo)] border border-traco px-4 py-3 text-center hover:border-nevoa"
          >
            Baixar a fatura em PDF
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
