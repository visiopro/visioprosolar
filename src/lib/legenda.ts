import { brl, data, mesRef, numero } from "./format.ts";

export type FaturaLegenda = {
  snapshot: {
    cliente: { nome: string; documento?: string | null; uc?: string; distribuidora?: string };
    usina: { nome: string; documento?: string | null; pix_favorecido?: string | null; logo_path?: string | null };
  };
  referencia: string;
  total_centavos: number | string;
  vencimento: string;
  economia_centavos: number | string;
  consumo_kwh?: number | string | null;
  compensada_kwh?: number | string | null;
  tarifa?: number | string | null;
  bandeira_centavos?: number | string | null;
  iluminacao_centavos?: number | string | null;
  sem_usina_centavos?: number | string | null;
  pix_copia_cola?: string | null;
  cobranca_link?: string | null;
  portal_token?: string | null;
  status?: string;
  paga_em?: string | null;
};

export const linkPortal = (token: string) =>
  `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://solar.visiopro.app.br").replace(/\/$/, "")}/c/${token}`;

/** Texto padrão da mensagem que acompanha o PDF da fatura */
export const PADRAO_FATURA = `*{{usina}}* ☀️
_Fatura de {{mes}}_

Olá, {{cliente}}! Sua fatura já está disponível.

💚 *{{valor}}*
📅 Vence em {{vencimento}}

Você economizou *{{economia}}* este mês.
_Sem a usina, sua conta seria {{sem_usina}}._

*Pague pelo PIX*: o código vai na próxima mensagem, é só copiar e colar no app do banco.

📱 Suas faturas e sua economia: {{portal}}

Qualquer dúvida, é só responder aqui. 💚`;

export const VARIAVEIS_FATURA = [
  "usina",
  "cliente",
  "mes",
  "valor",
  "vencimento",
  "economia",
  "sem_usina",
  "consumo",
  "energia",
  "bandeira",
  "iluminacao",
  "portal",
  "link_pagamento",
] as const;

export function legendaWhatsapp(f: FaturaLegenda, texto?: string | null): string {
  const bandeiraCentavos = Number(f.bandeira_centavos ?? 0);
  const iluminacaoCentavos = Number(f.iluminacao_centavos ?? 0);
  const semUsinaCentavos = Number(f.sem_usina_centavos ?? 0);
  const paga = f.status === "paga";

  const valores: Record<string, string> = {
    usina: f.snapshot.usina.nome,
    cliente: f.snapshot.cliente.nome.split(" ")[0],
    mes: mesRef(f.referencia),
    valor: brl(Number(f.total_centavos ?? 0)),
    vencimento: data(f.vencimento),
    economia: brl(Number(f.economia_centavos ?? 0)),
    sem_usina: brl(semUsinaCentavos),
    consumo: `${numero(Number(f.consumo_kwh ?? f.compensada_kwh ?? 0))} kWh`,
    energia: brl(Math.max(0, semUsinaCentavos - bandeiraCentavos - iluminacaoCentavos)),
    bandeira: bandeiraCentavos > 0 ? brl(bandeiraCentavos) : "Verde",
    iluminacao: brl(iluminacaoCentavos),
    portal: f.portal_token ? linkPortal(f.portal_token) : "",
    link_pagamento: f.cobranca_link ?? "",
  };

  const base = (texto?.trim() || PADRAO_FATURA).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, chave: string) =>
    chave in valores ? valores[chave] : todo,
  );

  // tira as linhas que ficaram vazias (sem portal, sem link de pagamento)
  const linhas = base
    .split("\n")
    .filter((l) => !/^[^\p{L}\p{N}]*$/u.test(l) || l.trim() === "")
    .join("\n");

  if (paga) {
    return [`*${valores.usina}* ☀️`, `_Fatura de ${valores.mes}_`, ``, `✅ Pagamento confirmado${f.paga_em ? ` em ${data(f.paga_em)}` : ""}.`, `Valor: ${valores.valor}`, ``, valores.portal ? `📱 Suas faturas: ${valores.portal}` : ""]
      .filter((l) => l !== "")
      .join("\n");
  }

  return linhas.trimEnd();
}
