import "server-only";
import { ErroCobranca, type Gateway } from "./tipos";

export type AmbienteAsaas = "sandbox" | "producao";

const BASE: Record<AmbienteAsaas, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

/** A própria chave diz o ambiente: $aact_hmlg_ = sandbox, $aact_prod_ = produção */
export function ambienteDaChave(chave: string, padrao: AmbienteAsaas): AmbienteAsaas {
  if (chave.startsWith("$aact_hmlg_")) return "sandbox";
  if (chave.startsWith("$aact_prod_")) return "producao";
  return padrao;
}

export function gatewayAsaas(apiKey: string, ambiente: AmbienteAsaas, opcoes: { forma: "PIX" | "UNDEFINED"; notificar: boolean }): Gateway {
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const res = await fetch(`${BASE[ambiente]}${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json", access_token: apiKey, "User-Agent": "VisioProSolar/1.0" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let json: { errors?: { description?: string }[] } & Record<string, unknown> = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // resposta não-JSON
    }
    if (!res.ok) {
      const detalhe = json?.errors?.[0]?.description || texto.slice(0, 200) || "sem detalhes";
      console.error("asaas", metodo, caminho, res.status, detalhe);
      throw new ErroCobranca(
        res.status === 401
          ? `O Asaas recusou a chave (401: ${detalhe}).`
          : res.status === 403
            ? `O Asaas bloqueou o acesso (403: ${detalhe}). Confira se a conta tem lista de IPs autorizados.`
            : `Asaas respondeu ${res.status}: ${detalhe}`,
      );
    }
    return json as T;
  }

  return {
    nome: "asaas",

    async testar() {
      await chamar("GET", "/customers?limit=1");
      return `Asaas (${ambiente === "producao" ? "produção" : "sandbox"})`;
    },

    async criar(d) {
      let customer = d.cliente.idExterno;
      if (!customer) {
        customer = (
          await chamar<{ id: string }>("POST", "/customers", {
            name: d.cliente.nome,
            cpfCnpj: d.cliente.documento,
            mobilePhone: d.cliente.whatsapp ? d.cliente.whatsapp.replace(/^55/, "") : undefined,
            email: d.cliente.email || undefined,
            externalReference: d.cliente.id,
            notificationDisabled: !opcoes.notificar,
          })
        ).id;
      }
      const cobranca = await chamar<{ id: string; invoiceUrl: string }>("POST", "/payments", {
        customer,
        billingType: opcoes.forma,
        value: d.valorCentavos / 100,
        dueDate: d.vencimento,
        description: d.descricao.slice(0, 500),
        externalReference: d.faturaId,
      });
      let pix: string | null = null;
      try {
        pix = (await chamar<{ payload: string }>("GET", `/payments/${cobranca.id}/pixQrCode`)).payload;
      } catch {
        // conta sem chave Pix ou forma que não gera QR: segue com o link
      }
      return { id: cobranca.id, link: cobranca.invoiceUrl, pix, clienteIdExterno: customer };
    },

    async cancelar(id) {
      await chamar("DELETE", `/payments/${id}`);
    },

    async baixaManual(id, valorCentavos, data) {
      await chamar("POST", `/payments/${id}/receiveInCash`, { paymentDate: data, value: valorCentavos / 100, notifyCustomer: false });
      return true;
    },

    async desfazerBaixa(id) {
      await chamar("POST", `/payments/${id}/undoReceivedInCash`);
      return true;
    },
  };
}
