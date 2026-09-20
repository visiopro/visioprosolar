import "server-only";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Integração com o Asaas (API v3). A chave de cada usina fica na tabela
 * usina_integracoes, que só o servidor consegue ler.
 */
export type Ambiente = "sandbox" | "producao";

const BASE: Record<Ambiente, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

export class ErroAsaas extends Error {}

export async function segredosAsaas(usinaId: string) {
  const { data } = await supabaseAdmin()
    .from("usina_integracoes")
    .select("asaas_api_key, asaas_webhook_token")
    .eq("usina_id", usinaId)
    .maybeSingle();
  return { apiKey: data?.asaas_api_key ?? null, webhookToken: data?.asaas_webhook_token ?? null };
}

export function clienteAsaas(apiKey: string, ambiente: Ambiente) {
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const res = await fetch(`${BASE[ambiente]}${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json", access_token: apiKey, "User-Agent": "VisioProSolar/1.0" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let json: { errors?: { code?: string; description?: string }[] } & Record<string, unknown> = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // resposta não-JSON (ex.: página de erro)
    }
    if (!res.ok) {
      const detalhe = json?.errors?.[0]?.description || texto.slice(0, 200) || "sem detalhes";
      console.error("asaas", metodo, caminho, res.status, detalhe);
      throw new ErroAsaas(
        res.status === 401
          ? `O Asaas recusou a chave (401: ${detalhe}).`
          : res.status === 403
            ? `O Asaas bloqueou o acesso (403: ${detalhe}). Confira se a conta tem lista de IPs autorizados em Integrações.`
            : `Asaas respondeu ${res.status}: ${detalhe}`,
      );
    }
    return json as T;
  }

  return {
    testar: () => chamar<{ totalCount: number }>("GET", "/customers?limit=1"),

    criarCliente: (c: { nome: string; documento: string; whatsapp: string | null; email: string | null; ref: string; notificar: boolean }) =>
      chamar<{ id: string }>("POST", "/customers", {
        name: c.nome,
        cpfCnpj: c.documento,
        mobilePhone: c.whatsapp ? c.whatsapp.replace(/^55/, "") : undefined,
        email: c.email || undefined,
        externalReference: c.ref,
        notificationDisabled: !c.notificar,
      }),

    criarCobranca: (p: { customer: string; forma: "PIX" | "UNDEFINED"; valorCentavos: number; vencimento: string; descricao: string; ref: string }) =>
      chamar<{ id: string; invoiceUrl: string; status: string }>("POST", "/payments", {
        customer: p.customer,
        billingType: p.forma,
        value: p.valorCentavos / 100,
        dueDate: p.vencimento,
        description: p.descricao.slice(0, 500),
        externalReference: p.ref,
      }),

    pixQrCode: (id: string) => chamar<{ encodedImage: string; payload: string }>("GET", `/payments/${id}/pixQrCode`),

    excluirCobranca: (id: string) => chamar<{ deleted: boolean }>("DELETE", `/payments/${id}`),

    receberEmDinheiro: (id: string, data: string, valorCentavos: number) =>
      chamar("POST", `/payments/${id}/receiveInCash`, { paymentDate: data, value: valorCentavos / 100, notifyCustomer: false }),

    desfazerRecebimento: (id: string) => chamar("POST", `/payments/${id}/undoReceivedInCash`),
  };
}
