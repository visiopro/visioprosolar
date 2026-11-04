import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Conta da distribuidora no nome da usina: vira (ou atualiza) a conta a pagar no financeiro,
 * com valor, vencimento e código de barras. Uma por conta recebida.
 */
export async function registrarContaAPagar(
  db: SupabaseClient,
  p: {
    usinaId: string;
    contaId: string;
    cliente: { id: string; nome: string; distribuidora: string };
    referencia: string; // AAAA-MM
    valorCentavos: number;
    vencimento: string; // AAAA-MM-DD
    codigoBarras: string | null;
    faturaId?: string;
  },
) {
  const linha = {
    usina_id: p.usinaId,
    descricao: `Conta ${p.cliente.distribuidora.split(" ")[0]} · ${p.cliente.nome} · ${p.referencia.split("-").reverse().join("/")}`,
    categoria: "conta_distribuidora",
    valor_centavos: p.valorCentavos,
    vencimento: p.vencimento,
    cliente_id: p.cliente.id,
    conta_id: p.contaId,
    codigo_barras: p.codigoBarras,
    ...(p.faturaId ? { fatura_id: p.faturaId } : {}),
  };
  const { data: existente } = await db.from("despesas").select("id, pago_em").eq("conta_id", p.contaId).maybeSingle();
  if (existente) {
    // já paga: não mexe no valor; só liga à fatura
    await db.from("despesas").update(existente.pago_em ? { fatura_id: p.faturaId ?? null } : linha).eq("id", existente.id);
  } else {
    await db.from("despesas").insert(linha);
  }
}
