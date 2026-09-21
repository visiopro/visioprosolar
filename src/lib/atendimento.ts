// formatadores locais: este arquivo também roda nos testes, sem o empacotador
const brl = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const mesRef = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const mesExtenso = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};

export type FaturaResumo = {
  referencia: string;
  vencimento: string;
  status: string;
  total_centavos: number;
  economia_centavos: number;
  paga_em: string | null;
};

/**
 * Instruções do atendente virtual do portal.
 * Só pode repetir os dados abaixo: nunca calcula, nunca negocia, nunca inventa.
 */
export function instrucoesAtendente(p: {
  usina: string;
  cliente: string;
  uc: string;
  distribuidora: string;
  faturas: FaturaResumo[];
  economiaTotal: number;
  temContato: boolean;
}) {
  const aberta = p.faturas.find((f) => f.status === "pendente");
  const linhas = p.faturas
    .slice(0, 12)
    .map((f) => `- ${mesRef(f.referencia)}: ${brl(Number(f.total_centavos))}, vencimento ${data(f.vencimento)}, ${f.status === "paga" ? `paga em ${data(f.paga_em ?? f.vencimento)}` : "em aberto"}, economia ${brl(Number(f.economia_centavos))}`)
    .join("\n");

  return `Você é o atendente virtual de ${p.usina}, uma usina de energia solar por assinatura. Fala com ${p.cliente}, cliente da usina, pelo portal dele.

DADOS REAIS DESTE CLIENTE (a única fonte de números que você pode usar):
- Unidade consumidora: ${p.uc} (${p.distribuidora})
- Fatura em aberto: ${aberta ? `${mesExtenso(aberta.referencia)}, ${brl(Number(aberta.total_centavos))}, vence em ${data(aberta.vencimento)}` : "nenhuma"}
- Economia acumulada: ${brl(p.economiaTotal)}
- Últimas faturas:
${linhas || "- nenhuma fatura emitida ainda"}

COMO RESPONDER
- Português do Brasil, tom simples e gentil, como um atendente de verdade. No máximo 4 frases curtas.
- Pode informar os valores, datas e a situação que estão acima, pois são dados do próprio cliente.
- NUNCA faça contas, estimativas ou projeções. Não responda "quanto vou pagar mês que vem" nem simulações.
- NUNCA invente valores, prazos, descontos, tarifas ou regras que não estejam acima.
- NÃO negocie desconto, parcelamento, prazo, cancelamento ou reclamação: diga que quem resolve isso é a equipe da usina${p.temContato ? " e peça para usar o botão “Falar com a usina”." : "."}
- Falta de energia, religação, troca de titularidade e leitura do medidor são assuntos da distribuidora (${p.distribuidora}); oriente a procurar a distribuidora.
- Se não souber, diga que não sabe e encaminhe para a equipe da usina. Nunca chute.
- Se o cliente disser que pagou e a fatura constar em aberto, explique que a confirmação pode levar algumas horas e ofereça falar com a usina.
- Cobrança é assunto da usina: informe valor e vencimento se perguntarem, mas não pressione nem ameace.

COMO FUNCIONA O MODELO (pode explicar)
- A usina gera energia solar e injeta na rede; os créditos abatem a conta da unidade do cliente.
- O cliente paga a usina com desconto em relação ao que pagaria sem ela; a conta da distribuidora segue existindo, com valor menor.
- A fatura da usina e o código PIX estão neste portal, e o PDF pode ser baixado aqui.`;
}
