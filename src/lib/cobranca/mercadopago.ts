import "server-only";
import { ErroCobranca, type Gateway } from "./tipos";

const API = "https://api.mercadopago.com";

export type PagamentoMP = {
  id: number;
  status: string; // pending, approved, cancelled, refunded, charged_back, rejected…
  transaction_amount: number;
  external_reference: string | null;
  date_approved: string | null;
  payment_method_id: string;
  fee_details?: { amount: number }[];
  transaction_details?: { net_received_amount?: number };
  point_of_interaction?: { transaction_data?: { qr_code?: string; ticket_url?: string } };
};

/** Data/hora de Brasília no formato que o Mercado Pago espera */
const fimDoDia = (iso: string) => `${iso}T23:59:59.000-03:00`;

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function chamarMP(token: string) {
  return async function <T>(metodo: string, caminho: string, corpo?: unknown, idempotencia?: string): Promise<T> {
    const res = await fetch(`${API}${caminho}`, {
      method: metodo,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(idempotencia ? { "X-Idempotency-Key": idempotencia } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let json: { message?: string; cause?: { description?: string }[] } & Record<string, unknown> = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // resposta não-JSON
    }
    if (!res.ok) {
      const detalhe = json?.cause?.[0]?.description || json?.message || texto.slice(0, 200) || "sem detalhes";
      console.error("mercadopago", metodo, caminho, res.status, detalhe);
      throw new ErroCobranca(
        res.status === 401 ? `O Mercado Pago recusou o token (401: ${detalhe}).` : `Mercado Pago respondeu ${res.status}: ${detalhe}`,
      );
    }
    return json as T;
  };
}

/** Titular da conta Mercado Pago (é o nome que aparece no banco ao pagar o PIX) */
export async function recebedorMercadoPago(token: string): Promise<{ nome: string; documento: string | null } | null> {
  try {
    const eu = await chamarMP(token)<{
      first_name?: string; last_name?: string; nickname?: string;
      company?: { corporate_name?: string; brand_name?: string } | null;
      identification?: { type?: string; number?: string } | null;
    }>("GET", "/users/me");
    const nome = (eu.company?.corporate_name || [eu.first_name, eu.last_name].filter(Boolean).join(" ") || eu.nickname || "").trim();
    return nome ? { nome: nome.toUpperCase(), documento: eu.identification?.number?.replace(/\D/g, "") || null } : null;
  } catch {
    return null;
  }
}

export function gatewayMercadoPago(token: string, urlNotificacao: string): Gateway {
  const chamar = chamarMP(token);

  return {
    nome: "mercadopago",

    async testar() {
      const eu = await chamar<{ nickname?: string; email?: string }>("GET", "/users/me");
      const teste = token.startsWith("TEST-") ? " (teste)" : "";
      return `Mercado Pago${teste}: ${eu.nickname ?? eu.email ?? "conta conectada"}`;
    },

    async criar(d) {
      // PIX do Mercado Pago aceita validade entre 30 min e 30 dias:
      // vale até 10 dias depois do vencimento, sem passar de 29 dias a partir de hoje
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const limite = somarDias(hoje, 29);
      const validade = [somarDias(d.vencimento, 10), limite].sort()[0];

      const [nome, ...resto] = d.cliente.nome.trim().split(/\s+/);
      const pag = await chamar<PagamentoMP>(
        "POST",
        "/v1/payments",
        {
          transaction_amount: d.valorCentavos / 100,
          description: d.descricao.slice(0, 250),
          payment_method_id: "pix",
          external_reference: d.faturaId,
          notification_url: urlNotificacao,
          date_of_expiration: fimDoDia(validade),
          payer: {
            // o Mercado Pago exige e-mail; sem e-mail do cliente, usa um endereço técnico
            email: d.cliente.email || `cliente-${d.cliente.uc}@solar.visiopro.app.br`,
            first_name: nome,
            last_name: resto.join(" ") || nome,
            // PIX não exige documento do pagador; quando o cliente tem CPF/CNPJ, vai junto
            ...(d.cliente.documento.length === 11 || d.cliente.documento.length === 14
              ? { identification: { type: d.cliente.documento.length === 14 ? "CNPJ" : "CPF", number: d.cliente.documento } }
              : {}),
          },
        },
        `fatura-${d.faturaId}`, // mesma fatura nunca gera duas cobranças
      );
      const t = pag.point_of_interaction?.transaction_data;
      return { id: String(pag.id), link: t?.ticket_url ?? null, pix: t?.qr_code ?? null };
    },

    async cancelar(id) {
      await chamar("PUT", `/v1/payments/${id}`, { status: "cancelled" });
    },

    async baixaManual(id) {
      // o Mercado Pago não tem "recebido por fora": cancela o PIX para o cliente não pagar duas vezes
      await chamar("PUT", `/v1/payments/${id}`, { status: "cancelled" });
      return false;
    },

    async desfazerBaixa() {
      return false; // a cobrança foi cancelada; o app oferece gerar uma nova
    },
  };
}
