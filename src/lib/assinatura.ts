/** Mensalidade da VisioPro: faixa de preço por cliente ativo da usina */
export const FAIXA = 30;

export type PrecoAssinatura = {
  preco_ate_30_centavos: number;
  preco_acima_centavos: number;
  minimo_centavos: number;
};

export function calcularMensalidade(clientesAtivos: number, p: PrecoAssinatura) {
  const ate = Math.min(clientesAtivos, FAIXA);
  const acima = Math.max(0, clientesAtivos - FAIXA);
  const bruto = ate * p.preco_ate_30_centavos + acima * p.preco_acima_centavos;
  return Math.max(bruto, p.minimo_centavos);
}

export function detalharMensalidade(clientesAtivos: number, p: PrecoAssinatura) {
  const ate = Math.min(clientesAtivos, FAIXA);
  const acima = Math.max(0, clientesAtivos - FAIXA);
  return {
    ate,
    acima,
    valorAte: ate * p.preco_ate_30_centavos,
    valorAcima: acima * p.preco_acima_centavos,
    total: calcularMensalidade(clientesAtivos, p),
  };
}
