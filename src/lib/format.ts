export const brl = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);

export const kwh = (v: number) =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)} kWh`;

export const numero = (v: number, casas = 2) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }).format(v);

/** "2026-09-01" -> "09/2026" */
export const mesRef = (iso: string) => {
  const [a, m] = iso.split("-");
  return `${m}/${a}`;
};

/** "2026-09-01" -> "setembro de 2026" */
export const mesExtenso = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};

/** "2026-09-25" -> "25/09/2026" */
export const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export const nFatura = (n: number) => String(n).padStart(5, "0");

/** Aceita "1.234,56", "1234.56", "0,9120" e devolve número */
export function parseNumeroBR(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim();
  if (!s) return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Data de hoje no fuso de Brasília, em ISO (AAAA-MM-DD) */
export function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Próximo vencimento no dia fixo do cliente: neste mês se ainda não passou, senão no próximo.
 * Dia maior que o mês (31 em novembro) vira o último dia do mês.
 */
export function proximoVencimento(hoje: string, dia: number): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const noMes = (ano: number, mes: number) => {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
  };
  const este = noMes(a, m);
  if (Number(este.slice(8)) > d) return este;
  return m === 12 ? noMes(a + 1, 1) : noMes(a, m + 1);
}
