/**
 * Bandeiras tarifárias (ANEEL). Valores em R$ por kWh, SEM tributos.
 * Atualizar quando a ANEEL revisar (normalmente em abril/maio).
 * Vigentes em 2026: amarela R$ 1,885 · vermelha P1 R$ 4,463 · vermelha P2 R$ 7,877 por 100 kWh.
 */
export type CorBandeira = "verde" | "amarela" | "vermelha_1" | "vermelha_2";

export const BANDEIRAS: Record<CorBandeira, { rotulo: string; rsKwh: number }> = {
  verde: { rotulo: "verde", rsKwh: 0 },
  amarela: { rotulo: "amarela", rsKwh: 0.01885 },
  vermelha_1: { rotulo: "vermelha patamar 1", rsKwh: 0.04463 },
  vermelha_2: { rotulo: "vermelha patamar 2", rsKwh: 0.07877 },
};

/** Normaliza o texto da cor lido na conta ("Verde", "VERMELHA P1", "vermelha patamar 2"...) */
export function corBandeira(v: unknown): CorBandeira | null {
  if (typeof v !== "string") return null;
  const t = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("verde")) return "verde";
  if (t.includes("amarel")) return "amarela";
  if (t.includes("vermelh")) return /2|ii\b/.test(t) ? "vermelha_2" : "vermelha_1";
  return null;
}

/**
 * Fator de tributos usado pelas distribuidoras: preço c/ trib = tarifa / ((1 − PIS − COFINS) × (1 − ICMS)).
 * Alíquotas em %. Sem leitura, usa as da Coelba/BA (ICMS 20,5%, PIS 1,18%, COFINS 5,46%).
 */
export function fatorTributos(icms?: number | null, pis?: number | null, cofins?: number | null) {
  const i = icms ?? 20.5;
  const pc = (pis ?? 1.18) + (cofins ?? 5.46);
  if (!(i >= 0 && i < 50 && pc >= 0 && pc < 30)) return 1 / ((1 - 0.0664) * (1 - 0.205));
  return 1 / ((1 - pc / 100) * (1 - i / 100));
}

/** Bandeira em R$ sobre o consumo real, com tributos */
export function estimarBandeira(cor: CorBandeira, consumoKwh: number, fator: number) {
  return Math.round(consumoKwh * BANDEIRAS[cor].rsKwh * fator * 100) / 100;
}
