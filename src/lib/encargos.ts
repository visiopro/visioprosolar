/**
 * Multa e juros de fatura paga com atraso, cobrados na fatura seguinte do cliente.
 * Multa sobre o valor; juros ao mês proporcionais aos dias de atraso (mês de 30 dias). Centavos inteiros.
 */
export type EncargoAtraso = {
  fatura_id: string;
  numero: number;
  referencia: string; // AAAA-MM-01
  vencimento: string; // AAAA-MM-DD
  paga_em: string;    // AAAA-MM-DD (data do pagamento, horário de Brasília)
  dias: number;
  valor_centavos: number;
  multa_centavos: number;
  juros_centavos: number;
};

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export function calcularEncargo(
  f: { id: string; numero: number; referencia: string; vencimento: string; paga_em: string; total_centavos: number },
  multaPercentual: number,
  jurosMensal: number,
): EncargoAtraso | null {
  const dias = diasEntre(f.vencimento, f.paga_em);
  if (!(dias > 0)) return null;
  const valor = Math.round(f.total_centavos);
  const multa = Math.round((valor * Math.max(0, multaPercentual)) / 100);
  const juros = Math.round((valor * Math.max(0, jurosMensal) * dias) / 100 / 30);
  if (multa + juros <= 0) return null;
  return {
    fatura_id: f.id, numero: f.numero, referencia: f.referencia, vencimento: f.vencimento, paga_em: f.paga_em,
    dias, valor_centavos: valor, multa_centavos: multa, juros_centavos: juros,
  };
}

export const totalEncargos = (lista: EncargoAtraso[]) => lista.reduce((s, e) => s + e.multa_centavos + e.juros_centavos, 0);

/** "Multa e juros por atraso · fatura nº 4 (10/2026), paga 8 dias após o vencimento" */
export function descreverEncargo(e: EncargoAtraso) {
  const ref = `${e.referencia.slice(5, 7)}/${e.referencia.slice(0, 4)}`;
  return `Multa e juros por atraso · fatura nº ${e.numero} (${ref}), paga ${e.dias} dia${e.dias > 1 ? "s" : ""} após o vencimento`;
}
