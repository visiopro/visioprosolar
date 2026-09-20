import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase/admin";
import { mesRef, soDigitos } from "../format";
import type { Usina } from "../usina";
import { gatewayAsaas } from "./asaas";
import { gatewayMercadoPago } from "./mercadopago";
import type { Gateway, NomeGateway } from "./tipos";

export { NOMES_GATEWAY, type NomeGateway } from "./tipos";

export async function segredos(usinaId: string) {
  const { data } = await supabaseAdmin()
    .from("usina_integracoes")
    .select("asaas_api_key, asaas_webhook_token, mp_access_token, evolution_token")
    .eq("usina_id", usinaId)
    .maybeSingle();
  return {
    asaasKey: (data?.asaas_api_key as string | null) ?? null,
    asaasWebhookToken: (data?.asaas_webhook_token as string | null) ?? null,
    mpToken: (data?.mp_access_token as string | null) ?? null,
    evolutionToken: (data?.evolution_token as string | null) ?? null,
  };
}

export const urlWebhookMP = (usinaId: string) =>
  `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/api/mercadopago/webhook/${usinaId}`;

/** Serviço configurado para a usina (ou para um serviço específico, ex.: cobrança antiga) */
export async function obterGateway(usina: Usina, nome?: NomeGateway): Promise<Gateway | null> {
  const qual = nome ?? (usina.gateway === "nenhum" ? null : usina.gateway);
  if (!qual) return null;
  const s = await segredos(usina.id);
  if (qual === "asaas") {
    return s.asaasKey ? gatewayAsaas(s.asaasKey, usina.asaas_ambiente, { forma: usina.asaas_forma, notificar: usina.asaas_notificar }) : null;
  }
  return s.mpToken ? gatewayMercadoPago(s.mpToken, urlWebhookMP(usina.id)) : null;
}

/** Cria a cobrança da fatura no serviço da usina e grava id, link e PIX dinâmico */
export async function cobrar(supabase: SupabaseClient, usina: Usina, faturaId: string): Promise<{ erro?: string }> {
  if (usina.gateway === "nenhum") return { erro: "Cobrança automática desligada." };
  const gateway = await obterGateway(usina);
  if (!gateway) return { erro: "Credencial do serviço de cobrança não configurada em Ajustes." };

  const { data: f } = await supabase
    .from("faturas")
    .select("id, referencia, vencimento, total_centavos, status, cobranca_id, clientes(id, nome, documento, whatsapp, email, uc, asaas_customer_id)")
    .eq("id", faturaId)
    .maybeSingle();
  if (!f) return { erro: "Fatura não encontrada." };
  if (f.cobranca_id) return {};
  if (f.status !== "pendente") return { erro: "Só faturas pendentes geram cobrança." };

  const c = f.clientes as unknown as { id: string; nome: string; documento: string | null; whatsapp: string | null; email: string | null; uc: string; asaas_customer_id: string | null };
  const doc = soDigitos(c.documento ?? "");
  if (doc.length !== 11 && doc.length !== 14) return { erro: `Cadastre o CPF ou CNPJ de ${c.nome} para cobrar automaticamente.` };
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (f.vencimento < hoje) return { erro: "O vencimento já passou. Cancele e reemita com nova data." };

  try {
    const r = await gateway.criar({
      faturaId: f.id,
      usinaId: usina.id,
      valorCentavos: Number(f.total_centavos),
      vencimento: f.vencimento,
      descricao: `Fatura de energia solar ${mesRef(f.referencia)} - ${usina.nome}`,
      cliente: { id: c.id, nome: c.nome, documento: doc, email: c.email, whatsapp: c.whatsapp, uc: c.uc, idExterno: gateway.nome === "asaas" ? c.asaas_customer_id : null },
    });
    if (gateway.nome === "asaas" && r.clienteIdExterno && r.clienteIdExterno !== c.asaas_customer_id) {
      await supabase.from("clientes").update({ asaas_customer_id: r.clienteIdExterno }).eq("id", c.id);
    }
    await supabase
      .from("faturas")
      .update({ cobranca_gateway: gateway.nome, cobranca_id: r.id, cobranca_link: r.link, ...(r.pix ? { pix_copia_cola: r.pix } : {}) })
      .eq("id", f.id);
    await supabase.from("eventos").insert({ usina_id: usina.id, acao: "cobranca_criada", alvo_id: f.id, detalhes: { gateway: gateway.nome, id: r.id } });
    return {};
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao criar a cobrança." };
  }
}
