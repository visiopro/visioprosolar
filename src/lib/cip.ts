/** Iluminação pública: resolve a faixa do município pela classe e pelo consumo */
export type ClasseCip = "B1" | "B2" | "B3" | "outros";

export const CLASSES: Record<ClasseCip, string> = {
  B1: "B1 – Residencial",
  B2: "B2 – Rural",
  B3: "B3 – Comercial e serviços",
  outros: "Outras classes",
};

export type FaixaCip = {
  classe: ClasseCip;
  consumo_min: number;
  consumo_max: number | null;
  tipo: "percentual" | "fixo";
  valor: number;
};

/**
 * Valor da CIP em reais para um consumo e um valor de energia.
 * Percentual incide sobre o valor da energia; fixo é o próprio valor.
 * Sem faixa que sirva, devolve null (o operador informa na conferência).
 */
export function cipDaTabela(faixas: FaixaCip[], classe: ClasseCip, consumoKwh: number, energiaReais: number): number | null {
  const f = faixas
    .filter((x) => x.classe === classe && consumoKwh >= x.consumo_min && (x.consumo_max === null || consumoKwh <= x.consumo_max))
    .sort((a, b) => b.consumo_min - a.consumo_min)[0];
  if (!f) return null;
  const v = f.tipo === "percentual" ? (energiaReais * f.valor) / 100 : f.valor;
  return Math.round(v * 100) / 100;
}

export const descreverFaixa = (f: FaixaCip) => {
  const ate = f.consumo_max === null ? "acima" : `até ${f.consumo_max}`;
  const faixa = f.consumo_max === null ? `${f.consumo_min} kWh ou mais` : `${f.consumo_min} a ${f.consumo_max} kWh`;
  const valor = f.tipo === "percentual" ? `${String(f.valor).replace(".", ",")}%` : `R$ ${f.valor.toFixed(2).replace(".", ",")}`;
  return `${faixa}: ${valor}${ate === "" ? "" : ""}`;
};
