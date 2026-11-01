/**
 * Relatório da usina por mês de referência das contas (competência):
 * quanto vendeu (kWh), quanto faturou, quanto pagou de conta mínima e quanto lucrou.
 * Tudo em centavos inteiros.
 */
export type FaturaRelatorio = {
  id: string;
  numero: number;
  referencia: string;              // AAAA-MM-01
  status: string;                  // pendente | paga | cancelada
  consumo_kwh: number | null;
  compensada_kwh: number | null;
  sem_usina_centavos: number;
  total_centavos: number;
  valor_recebido_centavos: number | null;
  custo_usina_centavos: number;    // conta mínima da distribuidora paga pela usina
  cliente: string;
  uc: string;
};

export type DespesaRelatorio = { valor_centavos: number; vencimento: string; categoria: string; fatura_id: string | null };

export type LinhaRelatorio = {
  id: string; numero: number; cliente: string; uc: string; status: string;
  kwh: number; semUsina: number; fatura: number; contaMinima: number; lucro: number;
};

export type Relatorio = {
  linhas: LinhaRelatorio[];
  kwh: number;
  semUsina: number;
  bruto: number;          // soma das faturas emitidas
  recebido: number;       // parte do bruto já paga
  contasMinimas: number;  // contas da distribuidora pagas pela usina
  lucroLiquido: number;   // bruto − contas mínimas
  outrasDespesas: number; // manutenção, limpeza, financiamento… do mês
  resultado: number;      // lucro líquido − outras despesas
};

const n = (v: number | null | undefined) => Number(v ?? 0);

/** kWh que a usina vendeu: o consumo real (conta cheia) ou, nos outros modos, a energia compensada */
const kwhVendido = (f: FaturaRelatorio) => n(f.consumo_kwh) || n(f.compensada_kwh);

export function montarRelatorio(faturas: FaturaRelatorio[], despesas: DespesaRelatorio[]): Relatorio {
  const linhas = faturas
    .filter((f) => f.status !== "cancelada")
    .map((f) => ({
      id: f.id, numero: f.numero, cliente: f.cliente, uc: f.uc, status: f.status,
      kwh: kwhVendido(f),
      semUsina: n(f.sem_usina_centavos),
      fatura: n(f.total_centavos),
      contaMinima: n(f.custo_usina_centavos),
      lucro: n(f.total_centavos) - n(f.custo_usina_centavos),
    }))
    .sort((a, b) => b.lucro - a.lucro);

  const soma = (k: keyof LinhaRelatorio) => linhas.reduce((s, l) => s + Number(l[k]), 0);
  const bruto = soma("fatura");
  const contasMinimas = soma("contaMinima");
  const recebido = faturas
    .filter((f) => f.status === "paga")
    .reduce((s, f) => s + n(f.valor_recebido_centavos ?? f.total_centavos), 0);
  // contas da distribuidora já ligadas a uma fatura entram como conta mínima, não aqui
  const outrasDespesas = despesas.filter((d) => !d.fatura_id).reduce((s, d) => s + n(d.valor_centavos), 0);
  const lucroLiquido = bruto - contasMinimas;

  return {
    linhas,
    kwh: Math.round(soma("kwh") * 1000) / 1000,
    semUsina: soma("semUsina"),
    bruto, recebido, contasMinimas, lucroLiquido, outrasDespesas,
    resultado: lucroLiquido - outrasDespesas,
  };
}
