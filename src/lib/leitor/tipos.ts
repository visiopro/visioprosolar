/** O que o leitor devolve. Tudo pode vir nulo: nada é inventado. */
export type LeituraConta = {
  uc: string | null;
  referencia: string | null;          // AAAA-MM
  distribuidora: string | null;
  titular: string | null;
  consumo_kwh: number | null;          // consumo REAL do mês (leitura atual − anterior × constante)
  consumo_faturado_kwh: number | null; // o que a distribuidora cobrou (com créditos, fica menor que o real)
  compensada_kwh: number | null;
  tarifa: number | null;              // R$/kWh com tributos (TUSD + TE)
  bandeira: number | null;            // R$
  iluminacao_publica: number | null;  // R$
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
  const t = String(v).trim();
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const textoOuNulo = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** UC só com dígitos e sem zeros à esquerda ("0003714154" = "3714154") */
export const normalizarUC = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/**
 * Consumo real = (leitura atual − anterior) × constante do medidor.
 * Com créditos da usina, a coluna "CONSUMO kWh" pode vir já descontada (ex.: 11,10 kWh
 * quando o medidor girou 91 kWh); o que vale para a conta cheia é o que o medidor girou.
 */
function consumoReal(b: Record<string, unknown>) {
  const ant = numeroOuNulo(b.leitura_anterior);
  const atu = numeroOuNulo(b.leitura_atual);
  const k = numeroOuNulo(b.constante_medidor) || 1;
  if (ant !== null && atu !== null && atu > ant) return Math.round((atu - ant) * k * 1000) / 1000;
  return numeroOuNulo(b.consumo_kwh);
}

/** TUSD + TE somadas no código (evita erro de conta do modelo) */
function somarTarifa(b: Record<string, unknown>) {
  const tusd = numeroOuNulo(b.tarifa_tusd);
  const te = numeroOuNulo(b.tarifa_te);
  if (tusd !== null && te !== null) return Math.round((tusd + te) * 1e8) / 1e8;
  return numeroOuNulo(b.tarifa);
}

/**
 * Prova real da tarifa: quantidade × preço unitário tem que dar o valor da linha.
 * Se não fechar (tolerância de 1 centavo por linha), algum dígito foi mal lido.
 */
function tarifaConfere(b: Record<string, unknown>): boolean | null {
  const linhas = [
    [b.tusd_quant, b.tarifa_tusd, b.tusd_valor],
    [b.te_quant, b.tarifa_te, b.te_valor],
  ].map((l) => l.map(numeroOuNulo));
  let verificou = false;
  for (const [q, p, v] of linhas) {
    if (q === null || p === null || v === null || q === 0) continue;
    verificou = true;
    if (Math.abs(q * p - v) > 0.015) return false;
  }
  return verificou ? true : null;
}

/** Normaliza a resposta do modelo, descartando tipos errados */
export function normalizarLeitura(bruto: Record<string, unknown>): LeituraConta {
  const ref = textoOuNulo(bruto.referencia, 7);
  const venc = textoOuNulo(bruto.vencimento_conta, 10);
  const campos = ["uc", "referencia", "consumo_kwh", "compensada_kwh", "tarifa", "valor_conta", "bandeira", "iluminacao_publica"];
  const duvidosos = Array.isArray(bruto.duvidosos)
    ? bruto.duvidosos.filter((c): c is string => typeof c === "string" && campos.includes(c))
    : [];
  const leitura: LeituraConta = {
    uc: normalizarUC(textoOuNulo(bruto.uc, 40) ?? "") || null,
    referencia: ref && /^\d{4}-(0[1-9]|1[0-2])$/.test(ref) ? ref : null,
    distribuidora: textoOuNulo(bruto.distribuidora, 80),
    titular: textoOuNulo(bruto.titular),
    consumo_kwh: consumoReal(bruto),
    consumo_faturado_kwh: numeroOuNulo(bruto.consumo_kwh),
    compensada_kwh: numeroOuNulo(bruto.compensada_kwh),
    tarifa: somarTarifa(bruto),
    bandeira: numeroOuNulo(bruto.bandeira),
    iluminacao_publica: numeroOuNulo(bruto.iluminacao_publica),
    valor_conta: numeroOuNulo(bruto.valor_conta),
    vencimento_conta: venc && /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : null,
    duvidosos,
    observacoes: textoOuNulo(bruto.observacoes, 400),
  };
  // Campo ausente também precisa de conferência (compensada ausente é normal na conta cheia)
  for (const c of ["uc", "referencia", "consumo_kwh", "tarifa", "valor_conta"]) if (leitura[c as keyof LeituraConta] === null && !duvidosos.includes(c)) duvidosos.push(c);
  // Bandeira proporcional: a conta cobra bandeira só sobre o consumo faturado;
  // a conta cheia precisa da bandeira sobre o consumo real
  const quantFaturada = numeroOuNulo(bruto.tusd_quant) ?? leitura.consumo_faturado_kwh;
  if (leitura.bandeira && quantFaturada && leitura.consumo_kwh && leitura.consumo_kwh > quantFaturada + 0.5) {
    const cheia = Math.round((leitura.bandeira / quantFaturada) * leitura.consumo_kwh * 100) / 100;
    leitura.observacoes = [
      leitura.observacoes,
      `Conta com créditos: o medidor marcou ${leitura.consumo_kwh} kWh e a distribuidora cobrou ${quantFaturada} kWh. Bandeira ajustada ao consumo real: R$ ${leitura.bandeira.toFixed(2).replace(".", ",")} na conta → R$ ${cheia.toFixed(2).replace(".", ",")}.`,
    ].filter(Boolean).join(" ");
    leitura.bandeira = cheia;
  }

  const prova = tarifaConfere(bruto);
  if (prova === false && !duvidosos.includes("tarifa")) {
    duvidosos.push("tarifa");
    leitura.observacoes = [leitura.observacoes, "A tarifa lida não fecha com o valor das linhas TUSD/TE. Confira os dígitos do preço unitário."].filter(Boolean).join(" ");
  }
  // Tarifa fora da faixa plausível no Brasil
  if (leitura.tarifa !== null && (leitura.tarifa < 0.2 || leitura.tarifa > 3) && !duvidosos.includes("tarifa")) duvidosos.push("tarifa");
  return leitura;
}
