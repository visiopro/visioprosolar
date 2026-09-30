import "server-only";
import { gatewayMercadoPago } from "./cobranca/mercadopago";
import { gatewayAsaas, ambienteDaChave, type AmbienteAsaas } from "./cobranca/asaas";
import type { Gateway } from "./cobranca/tipos";

/**
 * Gateway de cobrança da própria VisioPro para as mensalidades das usinas.
 * Prioriza Mercado Pago através de MERCADOPAGO_VISIOPRO_TOKEN (ou MP_VISIOPRO_TOKEN).
 * Se não configurado, recorre ao Asaas caso ASAAS_VISIOPRO_TOKEN esteja presente.
 */
export function gatewayVisioPro(): Gateway | null {
  const mpToken = (process.env.MERCADOPAGO_VISIOPRO_TOKEN || process.env.MP_VISIOPRO_TOKEN || "").trim();
  if (mpToken) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    const webhookUrl = `${appUrl}/api/mercadopago/webhook-visiopro`;
    return gatewayMercadoPago(mpToken, webhookUrl);
  }

  const asaasChave = (process.env.ASAAS_VISIOPRO_TOKEN ?? "").trim();
  if (asaasChave) {
    const ambiente = ambienteDaChave(asaasChave, (process.env.ASAAS_VISIOPRO_AMBIENTE as AmbienteAsaas) === "producao" ? "producao" : "sandbox");
    return gatewayAsaas(asaasChave, ambiente, { forma: "PIX", notificar: true });
  }

  return null;
}

/** Conta Asaas da própria VisioPro (mantida para fallback/retrocompatibilidade) */
export function asaasVisioPro() {
  const chave = (process.env.ASAAS_VISIOPRO_TOKEN ?? "").trim();
  if (!chave) return null;
  const ambiente = ambienteDaChave(chave, (process.env.ASAAS_VISIOPRO_AMBIENTE as AmbienteAsaas) === "producao" ? "producao" : "sandbox");
  return gatewayAsaas(chave, ambiente, { forma: "PIX", notificar: true });
}

export const tokenWebhookVisioPro = () => (process.env.ASAAS_VISIOPRO_WEBHOOK_TOKEN ?? "").trim();
