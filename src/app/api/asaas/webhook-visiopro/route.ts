import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tokenWebhookVisioPro } from "@/lib/assinatura-cobranca";

export const runtime = "nodejs";

type Pagamento = {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  externalReference?: string | null;
  billingType?: string;
};

const iguais = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Webhook do Asaas para cobranças de assinatura da própria VisioPro.
 * URL: /api/asaas/webhook-visiopro
 * Cabeçalho esperado: asaas-access-token correspondente a ASAAS_VISIOPRO_WEBHOOK_TOKEN.
 */
export async function POST(req: Request) {
  const tokenWebhook = tokenWebhookVisioPro();
  const recebido = req.headers.get("asaas-access-token") ?? "";

  if (!tokenWebhook || !iguais(recebido, tokenWebhook)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as { event?: string; payment?: Pagamento } | null;
  const evento = corpo?.event;
  const pag = corpo?.payment;

  if (!evento || !pag?.id) {
    return Response.json({ ok: true });
  }

  const admin = supabaseAdmin();
  const { data: fatura } = await admin
    .from("assinatura_faturas")
    .select("id, usina_id, status, valor_centavos")
    .eq("asaas_payment_id", pag.id)
    .maybeSingle();

  if (!fatura) {
    return Response.json({ ok: true, ignorado: "fatura de assinatura não encontrada" });
  }

  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
    if (fatura.status === "paga") {
      return Response.json({ ok: true });
    }

    const dataPagto = pag.clientPaymentDate || pag.paymentDate || pag.confirmedDate || new Date().toISOString().slice(0, 10);
    const valor = Math.round(pag.value * 100);

    const { data: atualizada } = await admin
      .from("assinatura_faturas")
      .update({
        status: "paga",
        paga_em: `${dataPagto}T12:00:00-03:00`,
        valor_recebido_centavos: valor,
      })
      .eq("id", fatura.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();

    if (atualizada) {
      await admin.from("eventos").insert({
        usina_id: fatura.usina_id,
        user_id: null,
        acao: "pagamento_assinatura_asaas",
        alvo_id: fatura.id,
        detalhes: { forma: pag.billingType, valor },
      });
    }

    return Response.json({ ok: true });
  }

  if (evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_CHARGEBACK_REQUESTED") {
    if (fatura.status === "paga") {
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
        acao: "estorno_assinatura_asaas",
        alvo_id: fatura.id,
        detalhes: { evento },
      });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
