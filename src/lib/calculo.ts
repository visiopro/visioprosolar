/**
 * Motor de cálculo da fatura da usina. Tudo em centavos inteiros.
 *
 * base = energia compensada × tarifa da distribuidora
 *        (o que essa energia custaria se viesse da distribuidora)
 *
 * Modos:
 * - percentual_compensada: a usina cobra a base com X% de desconto.
 * - percentual_gasto_total: o cliente paga X% a menos no gasto total com energia
 *   (conta da distribuidora + fatura da usina) do que pagaria sem a usina.
 * - tarifa_fixa: a usina cobra R$ X por kWh compensado.
 *
 * Em todos os modos: economia = sem_usina − (conta + fatura) = base − total.
 */
export type ModoDesconto = "percentual_compensada" | "percentual_gasto_total" | "tarifa_fixa";

export const MODOS: Record<ModoDesconto, { rotulo: string; unidade: string; ajuda: string }> = {
  percentual_compensada: {
    rotulo: "% sobre a energia compensada",
    unidade: "%",
    ajuda: "A usina cobra a energia compensada pela tarifa da distribuidora, com esse desconto.",
  },
  percentual_gasto_total: {
    rotulo: "% sobre o gasto total",
    unidade: "%",
    ajuda: "Somando a conta da distribuidora e a fatura da usina, o cliente paga esse percentual a menos.",
  },
  tarifa_fixa: {
    rotulo: "Tarifa fixa por kWh",
    unidade: "R$/kWh",
    ajuda: "A usina cobra um valor fixo por kWh compensado.",
  },
};

export type EntradaCalculo = {
  modo: ModoDesconto;
  descontoValor: number;      // % ou R$/kWh
  compensadaKwh: number;
  tarifa: number;             // R$/kWh da distribuidora, com tributos
  valorContaCentavos: number; // total da conta da distribuidora
};

export type ResultadoCalculo = {
  baseCentavos: number;
  semUsinaCentavos: number;
  totalCentavos: number;
  economiaCentavos: number;
};

export function calcularFatura(e: EntradaCalculo): ResultadoCalculo {
  if (!(e.compensadaKwh > 0)) throw new Error("Informe a energia compensada.");
  if (!(e.tarifa > 0)) throw new Error("Informe a tarifa da distribuidora.");
  if (!(e.descontoValor >= 0)) throw new Error("Desconto inválido.");
  if (e.modo !== "tarifa_fixa" && e.descontoValor > 100) throw new Error("O desconto não pode passar de 100%.");
  const conta = Math.max(0, Math.round(e.valorContaCentavos || 0));

  const base = Math.round(e.compensadaKwh * e.tarifa * 100);
  let total: number;
  let semUsina: number;

  switch (e.modo) {
    case "percentual_compensada":
      semUsina = base;
      total = base - Math.round((base * e.descontoValor) / 100);
      break;
    case "percentual_gasto_total":
      semUsina = conta + base;
      total = Math.round(semUsina * (1 - e.descontoValor / 100)) - conta;
      break;
    case "tarifa_fixa":
      semUsina = base;
      total = Math.round(e.compensadaKwh * e.descontoValor * 100);
      break;
  }

  if (total <= 0) throw new Error("Com essa regra a fatura fica zerada ou negativa. Revise o desconto ou os valores da conta.");
  return { baseCentavos: base, semUsinaCentavos: semUsina, totalCentavos: total, economiaCentavos: base - total };
}

/** Frase da regra para fatura e telas. Ex.: "Desconto de 20% sobre a energia compensada" */
export function descreverRegra(modo: ModoDesconto, valor: number) {
  const n = (v: number, c: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: c }).format(v);
  if (modo === "tarifa_fixa") return `Tarifa da usina: R$ ${n(valor, 4)} por kWh`;
  if (modo === "percentual_gasto_total") return `Desconto de ${n(valor, 2)}% no gasto total com energia`;
  return `Desconto de ${n(valor, 2)}% sobre a energia compensada`;
}
