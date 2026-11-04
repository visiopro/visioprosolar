/**
 * Linha digitável de conta de consumo (código de arrecadação, começa com 8):
 * 4 blocos de 11 dígitos + 1 dígito verificador cada (48 dígitos).
 * O 3º dígito diz o cálculo do DV (6/7 = módulo 10, 8/9 = módulo 11) e se o valor é real.
 */

function mod10(n: string) {
  let soma = 0;
  let peso = 2;
  for (let i = n.length - 1; i >= 0; i--) {
    let p = Number(n[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function mod11(n: string) {
  let soma = 0;
  let peso = 2;
  for (let i = n.length - 1; i >= 0; i--) {
    soma += Number(n[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

/** Devolve os 48 dígitos se a linha for válida (todos os DVs conferem); senão null */
export function validarLinhaArrecadacao(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 48 || d[0] !== "8") return null;
  const tipo = d[2];
  const dv = tipo === "6" || tipo === "7" ? mod10 : tipo === "8" || tipo === "9" ? mod11 : null;
  if (!dv) return null;
  for (let b = 0; b < 4; b++) {
    const bloco = d.slice(b * 12, b * 12 + 11);
    if (dv(bloco) !== Number(d[b * 12 + 11])) return null;
  }
  // DV geral do código de barras (4ª posição), calculado sobre os outros 43 dígitos
  const barras = [0, 1, 2, 3].map((b) => d.slice(b * 12, b * 12 + 11)).join("");
  if (dv(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return null;
  return d;
}

/** Valor em centavos gravado no código (só quando o 3º dígito indica valor real: 6 ou 8) */
export function valorDaLinha(linha48: string): number | null {
  if (linha48[2] !== "6" && linha48[2] !== "8") return null;
  const barras = [0, 1, 2, 3].map((b) => linha48.slice(b * 12, b * 12 + 11)).join("");
  return Number(barras.slice(4, 15));
}

/** Formato de exibição: 4 blocos "XXXXXXXXXXX-X" */
export const formatarLinha = (l: string) => [0, 1, 2, 3].map((b) => `${l.slice(b * 12, b * 12 + 11)}-${l[b * 12 + 11]}`).join(" ");

/** Procura no texto do PDF uma linha digitável de arrecadação válida (de preferência com o valor da conta) */
export function acharLinhaNoTexto(texto: string, valorCentavos: number | null): string | null {
  const candidatas = texto.match(/8\d{10}[\s.-]*\d[\s.-]*\d{11}[\s.-]*\d[\s.-]*\d{11}[\s.-]*\d[\s.-]*\d{11}[\s.-]*\d/g) ?? [];
  const validas = candidatas.map(validarLinhaArrecadacao).filter((l): l is string => !!l);
  return validas.find((l) => valorCentavos === null || valorDaLinha(l) === null || valorDaLinha(l) === valorCentavos) ?? null;
}
