import { supabaseAdmin } from "@/lib/supabase/admin";
import { chamarMP, type PagamentoMP } from "@/lib/cobranca/mercadopago";

export const runtime = "nodejs";

/**
 * Webhook do Mercado Pago para mensalidades da VisioPro:
 * URL: /api/mercadopago/webhook-visiopro
 *
 * O Mercado Pago notifica alterações nos pagamentos via query string ou corpo JSON.
 * O servidor então consulta a API do Mercado Pago diretamente usando o token da VisioPro
 * para confirmar status, valores recebidos e dar baixa na fatura da assinatura.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const corpo = (await req.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null;
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(corpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

  if (tipo !== "payment" || !/^\d+$/.test(id)) {
    return Response.json({ ok: true, ignorado: "não é evento de pagamento" });
  }

  const token = (process.env.MERCADOPAGO_VISIOPRO_TOKEN || process.env.MP_VISIOPRO_TOKEN || "").trim();
  if (!token) {
    console.error("webhook-visiopro mp: MERCADOPAGO_VISIOPRO_TOKEN não configurado");
    return Response.json({ ok: true, ignorado: "Mercado Pago VisioPro não configurado" });
  }

  let pag: PagamentoMP;
  try {
    pag = await chamarMP(token)<PagamentoMP>("GET", `/v1/payments/${id}`);
  } catch (e) {
    console.error("webhook-visiopro mp: falha ao consultar pagamento", e);
    return new Response("falha ao consultar o pagamento no Mercado Pago", { status: 502 });
  }

  const admin = supabaseAdmin();

  // Localiza a fatura de assinatura pelo ID da cobrança ou pelo external_reference
  let { data: fatura } = await admin
    .from("assinatura_faturas")
    .select("id, usina_id, status, valor_centavos")
    .or(`cobranca_id.eq.${pag.id},asaas_payment_id.eq.${pag.id}`)
    .maybeSingle();

  if (!fatura && pag.external_reference) {
    const ref = pag.external_reference;
    const faturaId = ref.startsWith("ass_") ? null : ref;
    if (faturaId) {
      const { data: porRef } = await admin
        .from("assinatura_faturas")
        .select("id, usina_id, status, valor_centavos")
        .eq("id", faturaId)
        .maybeSingle();
      fatura = porRef;
    }
  }

  if (!fatura) {
    return Response.json({ ok: true, ignorado: "fatura de assinatura não encontrada" });
  }

  if (pag.status === "approved" && fatura.status === "pendente") {
    const valor = Math.round(pag.transaction_amount * 100);
    const dataPagto = pag.date_approved ?? new Date().toISOString();

    const { data: atualizada } = await admin
      .from("assinatura_faturas")
      .update({
        status: "paga",
        paga_em: dataPagto,
        valor_recebido_centavos: valor,
        cobranca_id: String(pag.id),
      })
      .eq("id", fatura.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();

    if (atualizada) {
      await admin.from("eventos").insert({
        usina_id: fatura.usina_id,
        user_id: null,
        acao: "pagamento_assinatura_mp",
        alvo_id: fatura.id,
        detalhes: { valor, id: pag.id, forma: pag.payment_method_id },
      });
    }

    return Response.json({ ok: true });
  }

  if ((pag.status === "refunded" || pag.status === "charged_back") && fatura.status === "paga") {
    await admin
      .from("assinatura_faturas")
      .update({
        status: "pendente",
        paga_em: null,
        valor_recebido_centavos: null,
      })
      .eq("id", fatura.id);

    await admin.from("eventos").insert({
      usina_id: fatura.usina_id,
      user_id: null,
      acao: "estorno_assinatura_mp",
      alvo_id: fatura.id,
      detalhes: { status: pag.status, id: pag.id },
    });
  }

  return Response.json({ ok: true });
}
