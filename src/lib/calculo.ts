/**
 * Motor de cálculo da fatura da usina. Tudo em centavos inteiros.
 *
 * Modos:
 * - percentual_conta_cheia (padrão): a conta está no nome da usina e chega com tarifa mínima.
 *   O cliente paga a conta cheia (sem usina) com X% de desconto:
 *   sem_usina = consumo × tarifa + bandeira + iluminação pública
 *   A conta mínima paga pela usina é custo interno e não entra na fatura do cliente.
 * - percentual_compensada: a usina cobra a energia compensada × tarifa, com X% de desconto.
 * - percentual_gasto_total: conta da distribuidora + fatura da usina = X% a menos que sem a usina.
 * - tarifa_fixa: a usina cobra R$ X por kWh compensado.
 *
 * Em todos os modos: economia = sem_usina − o que o cliente paga.
 */
export type ModoDesconto = "percentual_conta_cheia" | "percentual_compensada" | "percentual_gasto_total" | "tarifa_fixa";

export const MODOS: Record<ModoDesconto, { rotulo: string; unidade: string; ajuda: string }> = {
  percentual_conta_cheia: {
    rotulo: "% sobre a conta cheia",
    unidade: "%",
    ajuda: "A conta está no nome da usina. O cliente paga a conta sem usina (consumo × tarifa + bandeira + iluminação pública) com esse desconto.",
  },
  percentual_compensada: {
    rotulo: "% sobre a energia compensada",
    unidade: "%",
    ajuda: "A conta continua no nome do cliente. A usina cobra a energia compensada pela tarifa da distribuidora, com esse desconto.",
  },
  percentual_gasto_total: {
    rotulo: "% sobre o gasto total",
    unidade: "%",
    ajuda: "A conta continua no nome do cliente. Somando a conta e a fatura da usina, ele paga esse percentual a menos.",
  },
  tarifa_fixa: {
    rotulo: "Tarifa fixa por kWh",
    unidade: "R$/kWh",
    ajuda: "A usina cobra um valor fixo por kWh compensado.",
  },
};

/** Modos em que a cobrança depende da energia compensada que aparece na conta */
export const usaCompensada = (m: ModoDesconto) => m !== "percentual_conta_cheia";

export type EntradaCalculo = {
  modo: ModoDesconto;
  descontoValor: number;        // % ou R$/kWh
  tarifa: number;               // R$/kWh da distribuidora, com tributos
  consumoKwh?: number;          // conta cheia
  compensadaKwh?: number;       // demais modos
  valorContaCentavos?: number;  // total da conta que chegou
  bandeiraCentavos?: number;    // conta cheia
  iluminacaoCentavos?: number;  // conta cheia
  semUsinaAjustadoCentavos?: number | null; // conta cheia: valor digitado pelo dono no lugar do cálculo
};

export type ResultadoCalculo = {
  energiaCentavos: number;      // kWh × tarifa
  semUsinaCentavos: number;     // o que o cliente pagaria sem a usina
  totalCentavos: number;        // o que o cliente paga à usina
  economiaCentavos: number;
};

const cent = (v: number | undefined) => Math.max(0, Math.round(v || 0));

export function calcularFatura(e: EntradaCalculo): ResultadoCalculo {
  if (!(e.descontoValor >= 0)) throw new Error("Desconto inválido.");
  if (e.modo !== "tarifa_fixa" && e.descontoValor > 100) throw new Error("O desconto não pode passar de 100%.");
  const conta = cent(e.valorContaCentavos);
  let energia: number;
  let semUsina: number;
  let total: number;

  if (e.modo === "percentual_conta_cheia") {
    const ajustado = e.semUsinaAjustadoCentavos;
    if (ajustado !== null && ajustado !== undefined) {
      if (!(ajustado > 0)) throw new Error("Informe o valor da conta sem usina.");
      energia = cent(ajustado) - cent(e.bandeiraCentavos) - cent(e.iluminacaoCentavos);
      semUsina = cent(ajustado);
    } else {
      if (!((e.consumoKwh ?? 0) > 0)) throw new Error("Informe o consumo do mês.");
      if (!(e.tarifa > 0)) throw new Error("Informe a tarifa da distribuidora.");
      energia = Math.round(e.consumoKwh! * e.tarifa * 100);
      semUsina = energia + cent(e.bandeiraCentavos) + cent(e.iluminacaoCentavos);
    }
    total = semUsina - Math.round((semUsina * e.descontoValor) / 100);
  } else {
    if (!((e.compensadaKwh ?? 0) > 0)) throw new Error("Essa conta não tem energia compensada. O cliente ainda não recebeu créditos da usina neste mês.");
    if (!(e.tarifa > 0)) throw new Error("Informe a tarifa da distribuidora.");
    energia = Math.round(e.compensadaKwh! * e.tarifa * 100);
    if (e.modo === "percentual_compensada") {
      semUsina = energia;
      total = energia - Math.round((energia * e.descontoValor) / 100);
    } else if (e.modo === "percentual_gasto_total") {
      semUsina = conta + energia;
      total = Math.round(semUsina * (1 - e.descontoValor / 100)) - conta;
      semUsina = energia; // economia comparável: base − total
    } else {
      semUsina = energia;
      total = Math.round(e.compensadaKwh! * e.descontoValor * 100);
    }
  }

  if (total <= 0) throw new Error("Com essa regra a fatura fica zerada ou negativa. Revise o desconto ou os valores da conta.");
  return { energiaCentavos: energia, semUsinaCentavos: semUsina, totalCentavos: total, economiaCentavos: semUsina - total };
}

/** Frase da regra para fatura e telas. Ex.: "Desconto de 20% sobre a conta de energia" */
export function descreverRegra(modo: ModoDesconto, valor: number) {
  const n = (v: number, c: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: c }).format(v);
  if (modo === "tarifa_fixa") return `Tarifa da usina: R$ ${n(valor, 4)} por kWh`;
  if (modo === "percentual_gasto_total") return `Desconto de ${n(valor, 2)}% no gasto total com energia`;
  if (modo === "percentual_conta_cheia") return `Desconto de ${n(valor, 2)}% sobre a conta de energia`;
  return `Desconto de ${n(valor, 2)}% sobre a energia compensada`;
}
