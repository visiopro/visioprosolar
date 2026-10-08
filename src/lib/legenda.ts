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

export function legendaWhatsapp(f: FaturaLegenda): string {
  const usinaNome = f.snapshot.usina.nome;
  const clienteNome = f.snapshot.cliente.nome;
  const mesAno = mesRef(f.referencia);

  const consumo = Number(f.consumo_kwh ?? f.compensada_kwh ?? 0);
  const bandeiraCentavos = Number(f.bandeira_centavos ?? 0);
  const iluminacaoCentavos = Number(f.iluminacao_centavos ?? 0);
  const semUsinaCentavos = Number(f.sem_usina_centavos ?? 0);
  const valorEnergiaCentavos = Math.max(0, semUsinaCentavos - bandeiraCentavos - iluminacaoCentavos);
  const economiaCentavos = Number(f.economia_centavos ?? 0);
  const totalCentavos = Number(f.total_centavos ?? 0);

  const bandeiraTexto = bandeiraCentavos > 0 ? brl(bandeiraCentavos) : "Verde";

  const linhas = [
    `☀️ ${usinaNome.toUpperCase()}`,
    `Olá, ${clienteNome}! 👋`,
    `Sua fatura de energia referente a ${mesAno} já está disponível.`,
    ``,
    `📊 RESUMO DA SUA FATURA`,
    `⚡ Consumo: ${numero(consumo)} kWh`,
    `🏷️ Bandeira tarifária: ${bandeiraTexto}`,
    `💰 Valor da energia: ${brl(valorEnergiaCentavos)}`,
    `💡 Iluminação pública: ${brl(iluminacaoCentavos)}`,
    `💵 Valor total sem desconto: ${brl(semUsinaCentavos)}`,
    `📉 Economia obtida: ${brl(economiaCentavos)}`,
    `💚 VALOR A PAGAR: ${brl(totalCentavos)}`,
    `📅 Vencimento: ${data(f.vencimento)}`,
  ];

  if (f.status === "paga") {
    linhas.push(``, `✅ Fatura paga${f.paga_em ? ` em ${data(f.paga_em)}` : ""}.`);
  } else if (f.pix_copia_cola) {
    linhas.push(
      ``,
      `💳 PAGAMENTO VIA PIX`,
      `Código PIX Copia e Cola:`,
      f.pix_copia_cola
    );
  }

  if (f.cobranca_link && f.status !== "paga") {
    linhas.push(``, `🔗 Link para pagamento:`, f.cobranca_link);
  }

  if (f.portal_token) {
    linhas.push(
      ``,
      `📱 Acompanhe sua fatura e sua economia:`,
      linkPortal(f.portal_token)
    );
  }

  linhas.push(
    ``,
    `Obrigado pela confiança na ${usinaNome}! 💚`,
    `Qualquer dúvida, é só responder esta mensagem. Estamos à disposição.`
  );

  return linhas.join("\n");
}
