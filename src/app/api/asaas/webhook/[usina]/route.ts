import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { segredosAsaas } from "@/lib/asaas";

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
 * Webhook do Asaas, um endereço por usina: /api/asaas/webhook/<id da usina>
 * O token enviado pelo Asaas no cabeçalho asaas-access-token precisa bater com o da usina.
 * Sempre responde 200 para eventos válidos (o Asaas pausa a fila se receber erro).
 */
export async function POST(req: Request, { params }: { params: Promise<{ usina: string }> }) {
  const { usina } = await params;
  if (!/^[0-9a-f-]{36}$/.test(usina)) return new Response("usina inválida", { status: 400 });

  let webhookToken: string | null = null;
  try {
    webhookToken = (await segredosAsaas(usina)).webhookToken;
  } catch (e) {
    console.error("webhook asaas", e);
    return new Response("erro de configuração", { status: 500 });
  }
  const recebido = req.headers.get("asaas-access-token") ?? "";
  if (!webhookToken || !iguais(recebido, webhookToken)) return new Response("não autorizado", { status: 401 });

  const corpo = (await req.json().catch(() => null)) as { event?: string; payment?: Pagamento } | null;
  const evento = corpo?.event;
  const pag = corpo?.payment;
  if (!evento || !pag?.id) return Response.json({ ok: true });

  const admin = supabaseAdmin();
  const { data: f } = await admin
    .from("faturas")
    .select("id, status, total_centavos, pagamento_origem")
    .eq("usina_id", usina)
    .eq("asaas_payment_id", pag.id)
    .maybeSingle();
  if (!f) return Response.json({ ok: true, ignorado: "fatura não encontrada" });

  const registrar = (acao: string, detalhes: Record<string, unknown>) =>
    admin.from("eventos").insert({ usina_id: usina, user_id: null, acao, alvo_id: f.id, detalhes });

  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
    // recebido em dinheiro foi lançado pelo próprio app (baixa manual): nada a fazer
    if (pag.status === "RECEIVED_IN_CASH" || f.status !== "pendente") return Response.json({ ok: true });

    const dataPagto = pag.clientPaymentDate || pag.paymentDate || pag.confirmedDate || new Date().toISOString().slice(0, 10);
    const valor = Math.round(pag.value * 100);
    const liquido = pag.netValue !== undefined ? Math.round(pag.netValue * 100) : null;
    const taxa = liquido !== null && liquido < valor ? valor - liquido : 0;

    const { data: atualizada } = await admin
      .from("faturas")
      .update({
        status: "paga",
        paga_em: `${dataPagto}T12:00:00-03:00`,
        pagamento_origem: "asaas",
        valor_recebido_centavos: valor,
        taxa_centavos: taxa || null,
      })
      .eq("id", f.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();

    if (atualizada) {
      if (taxa > 0) {
        await admin.from("despesas").insert({
          usina_id: usina,
          descricao: `Taxa Asaas · ${pag.billingType ?? "cobrança"}`,
          categoria: "taxas",
          valor_centavos: taxa,
          vencimento: dataPagto,
          pago_em: dataPagto,
          fatura_id: f.id,
          created_by: null,
        });
      }
      await registrar("pagamento_asaas", { forma: pag.billingType, valor, taxa });
    }
    return Response.json({ ok: true });
  }

  if (evento === "PAYMENT_REFUNDED" || evento === "PAYMENT_CHARGEBACK_REQUESTED") {
    if (f.status === "paga" && f.pagamento_origem === "asaas") {
      await admin.from("faturas").update({ status: "pendente", paga_em: null, pagamento_origem: null, valor_recebido_centavos: null }).eq("id", f.id);
      await admin.from("despesas").delete().eq("fatura_id", f.id).eq("categoria", "taxas");
      await registrar("estorno_asaas", { evento });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
