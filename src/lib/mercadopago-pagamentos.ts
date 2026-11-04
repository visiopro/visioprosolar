import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { segredos } from "./cobranca";
import { chamarMP, type PagamentoMP } from "./cobranca/mercadopago";

/**
 * Consulta o pagamento no Mercado Pago com o token da própria usina e aplica na fatura
 * (baixa, taxa, estorno). Usado pelo webhook e pela conferência diária (aviso perdido).
 * Nunca confia no corpo do aviso: confere fatura, usina e valor.
 */
export async function processarPagamentoMP(usina: string, id: string): Promise<Response> {
  let token: string | null = null;
  try {
    token = (await segredos(usina)).mpToken;
  } catch (e) {
    console.error("webhook mp", e);
    return new Response("erro de configuração", { status: 500 });
  }
  if (!token) return Response.json({ ok: true, ignorado: "usina sem Mercado Pago" });

  let pag: PagamentoMP;
  try {
    pag = await chamarMP(token)<PagamentoMP>("GET", `/v1/payments/${id}`);
  } catch {
    // 5xx: o Mercado Pago tenta de novo mais tarde
    return new Response("falha ao consultar o pagamento", { status: 502 });
  }

  const admin = supabaseAdmin();
  const { data: f } = await admin
    .from("faturas")
    .select("id, status, total_centavos, pagamento_origem")
    .eq("usina_id", usina)
    .eq("cobranca_gateway", "mercadopago")
    .eq("cobranca_id", String(pag.id))
    .maybeSingle();
  if (!f || (pag.external_reference && pag.external_reference !== f.id)) return Response.json({ ok: true, ignorado: "fatura não encontrada" });

  const registrar = (acao: string, detalhes: Record<string, unknown>) =>
    admin.from("eventos").insert({ usina_id: usina, user_id: null, acao, alvo_id: f.id, detalhes });

  if (pag.status === "approved" && f.status === "pendente") {
    const valor = Math.round(pag.transaction_amount * 100);
    if (valor !== Number(f.total_centavos)) console.warn("webhook mp: valor diferente da fatura", f.id, valor, f.total_centavos);
    const taxaDetalhe = (pag.fee_details ?? []).reduce((s, t) => s + Math.round((t.amount ?? 0) * 100), 0);
    const liquido = pag.transaction_details?.net_received_amount;
    const taxa = taxaDetalhe || (liquido !== undefined ? Math.max(0, valor - Math.round(liquido * 100)) : 0);
    const dataPagto = (pag.date_approved ?? new Date().toISOString()).slice(0, 10);

    const { data: atualizada } = await admin
      .from("faturas")
      .update({
        status: "paga",
        paga_em: pag.date_approved ?? new Date().toISOString(),
        pagamento_origem: "mercadopago",
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
          descricao: `Taxa Mercado Pago · ${pag.payment_method_id}`,
          categoria: "taxas",
          valor_centavos: taxa,
          vencimento: dataPagto,
          pago_em: dataPagto,
          fatura_id: f.id,
          created_by: null,
        });
      }
      await registrar("pagamento_mp", { valor, taxa });
    }
    return Response.json({ ok: true, baixa: !!atualizada });
  }

  if ((pag.status === "refunded" || pag.status === "charged_back") && f.status === "paga" && f.pagamento_origem === "mercadopago") {
    await admin.from("faturas").update({ status: "pendente", paga_em: null, pagamento_origem: null, valor_recebido_centavos: null }).eq("id", f.id);
    await admin.from("despesas").delete().eq("fatura_id", f.id).eq("categoria", "taxas");
    await registrar("estorno_mp", { status: pag.status });
  }

  return Response.json({ ok: true });
}
