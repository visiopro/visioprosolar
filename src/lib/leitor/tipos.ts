/** O que o leitor devolve. Tudo pode vir nulo: nada é inventado. */
export type LeituraConta = {
  uc: string | null;
  referencia: string | null;          // AAAA-MM
  distribuidora: string | null;
  titular: string | null;
  consumo_kwh: number | null;
  compensada_kwh: number | null;
  tarifa: number | null;              // R$/kWh com tributos
  valor_conta: number | null;         // R$
  vencimento_conta: string | null;    // AAAA-MM-DD
  duvidosos: string[];                // campos que precisam de atenção na conferência
  observacoes: string | null;
};

export interface LeitorDeConta {
  ler(arquivo: { bytes: ArrayBuffer; tipo: string }): Promise<LeituraConta>;
}

const numeroOuNulo = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const textoOuNulo = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Normaliza a resposta do modelo, descartando tipos errados */
export function normalizarLeitura(bruto: Record<string, unknown>): LeituraConta {
  const ref = textoOuNulo(bruto.referencia, 7);
  const venc = textoOuNulo(bruto.vencimento_conta, 10);
  const campos = ["uc", "referencia", "consumo_kwh", "compensada_kwh", "tarifa", "valor_conta"];
  const duvidosos = Array.isArray(bruto.duvidosos)
    ? bruto.duvidosos.filter((c): c is string => typeof c === "string" && campos.includes(c))
    : [];
  const leitura: LeituraConta = {
    uc: textoOuNulo(bruto.uc, 40)?.replace(/\D/g, "") || null,
    referencia: ref && /^\d{4}-(0[1-9]|1[0-2])$/.test(ref) ? ref : null,
    distribuidora: textoOuNulo(bruto.distribuidora, 80),
    titular: textoOuNulo(bruto.titular),
    consumo_kwh: numeroOuNulo(bruto.consumo_kwh),
    compensada_kwh: numeroOuNulo(bruto.compensada_kwh),
    tarifa: numeroOuNulo(bruto.tarifa),
    valor_conta: numeroOuNulo(bruto.valor_conta),
    vencimento_conta: venc && /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : null,
    duvidosos,
    observacoes: textoOuNulo(bruto.observacoes, 400),
  };
  // Campo ausente também precisa de conferência
  for (const c of campos) if (leitura[c as keyof LeituraConta] === null && !duvidosos.includes(c)) duvidosos.push(c);
  // Tarifa fora da faixa plausível no Brasil
  if (leitura.tarifa !== null && (leitura.tarifa < 0.2 || leitura.tarifa > 3) && !duvidosos.includes("tarifa")) duvidosos.push("tarifa");
  return leitura;
}
