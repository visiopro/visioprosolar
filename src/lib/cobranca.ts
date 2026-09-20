import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAsaas, segredosAsaas } from "./asaas";
import { mesRef, soDigitos } from "./format";
import type { Usina } from "./usina";

/**
 * Cria a cobrança da fatura no Asaas (e o cliente, se ainda não existir lá).
 * Grava o id, o link de pagamento e o PIX dinâmico na fatura.
 */
export async function cobrarNoAsaas(supabase: SupabaseClient, usina: Usina, faturaId: string): Promise<{ erro?: string }> {
  if (!usina.asaas_ativo) return { erro: "Integração com o Asaas desligada." };
  const { apiKey } = await segredosAsaas(usina.id);
  if (!apiKey) return { erro: "Chave do Asaas não configurada em Ajustes." };

  const { data: f } = await supabase
    .from("faturas")
    .select("id, numero, referencia, vencimento, total_centavos, status, asaas_payment_id, cliente_id, clientes(id, nome, documento, whatsapp, email, asaas_customer_id)")
    .eq("id", faturaId)
    .maybeSingle();
  if (!f) return { erro: "Fatura não encontrada." };
  if (f.asaas_payment_id) return {};
  if (f.status !== "pendente") return { erro: "Só faturas pendentes geram cobrança." };

  const c = f.clientes as unknown as { id: string; nome: string; documento: string | null; whatsapp: string | null; email: string | null; asaas_customer_id: string | null };
  const doc = soDigitos(c.documento ?? "");
  if (doc.length !== 11 && doc.length !== 14) return { erro: `Cadastre o CPF ou CNPJ de ${c.nome} para cobrar pelo Asaas.` };

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (f.vencimento < hoje) return { erro: "O vencimento já passou. Cancele e reemita com nova data." };

  try {
    const asaas = clienteAsaas(apiKey, usina.asaas_ambiente);
    let customer = c.asaas_customer_id;
    if (!customer) {
      customer = (await asaas.criarCliente({ nome: c.nome, documento: doc, whatsapp: c.whatsapp, email: c.email, ref: c.id, notificar: usina.asaas_notificar })).id;
      await supabase.from("clientes").update({ asaas_customer_id: customer }).eq("id", c.id);
    }
    const cobranca = await asaas.criarCobranca({
      customer,
      forma: usina.asaas_forma,
      valorCentavos: Number(f.total_centavos),
      vencimento: f.vencimento,
      descricao: `Fatura de energia solar ${mesRef(f.referencia)} - ${usina.nome}`,
      ref: f.id,
    });
    let pix: string | null = null;
    try {
      pix = (await asaas.pixQrCode(cobranca.id)).payload;
    } catch {
      // cobrança sem PIX disponível (ex.: forma não definida); segue com o link
    }
    await supabase
      .from("faturas")
      .update({ asaas_payment_id: cobranca.id, asaas_link: cobranca.invoiceUrl, ...(pix ? { pix_copia_cola: pix } : {}) })
      .eq("id", f.id);
    await supabase.from("eventos").insert({ usina_id: usina.id, acao: "cobranca_asaas", alvo_id: f.id, detalhes: { id: cobranca.id } });
    return {};
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao criar a cobrança no Asaas." };
  }
}
