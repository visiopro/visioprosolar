/** Contrato comum dos serviços de cobrança (Asaas, Mercado Pago, …) */
export type NomeGateway = "asaas" | "mercadopago";

export const NOMES_GATEWAY: Record<NomeGateway, string> = {
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
};

export type DadosCobranca = {
  faturaId: string;
  usinaId: string;
  valorCentavos: number;
  vencimento: string; // AAAA-MM-DD
  descricao: string;
  tentativa?: number; // quantas cobranças essa fatura já teve (cancelada/refeita gera uma nova)
  cliente: {
    id: string;
    nome: string;
    documento: string; // só dígitos, 11 ou 14
    email: string | null;
    whatsapp: string | null;
    uc: string;
    idExterno: string | null; // id do cliente no serviço, se já existir
  };
};

export type CobrancaCriada = {
  id: string;
  link: string | null;
  pix: string | null;
  clienteIdExterno?: string; // para guardar e reaproveitar
};

export class ErroCobranca extends Error {}

export interface Gateway {
  nome: NomeGateway;
  testar(): Promise<string>; // descrição da conta conectada
  criar(d: DadosCobranca): Promise<CobrancaCriada>;
  cancelar(id: string): Promise<void>;
  /** Pagamento recebido por fora do serviço. Retorna true se a cobrança continua existindo no serviço. */
  baixaManual(id: string, valorCentavos: number, data: string): Promise<boolean>;
  /** Desfaz a baixa manual. Retorna false se não é possível (é preciso gerar nova cobrança). */
  desfazerBaixa(id: string): Promise<boolean>;
}
