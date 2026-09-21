import { test } from "node:test";
import assert from "node:assert/strict";
import { instrucoesAtendente } from "./atendimento.ts";

const base = {
  usina: "Usina Sol",
  cliente: "José",
  uc: "3714154",
  distribuidora: "Coelba",
  economiaTotal: 5211,
  contato: "5577999990000",
  faturas: [
    { referencia: "2026-09-01", vencimento: "2026-09-30", status: "pendente", total_centavos: 8805, economia_centavos: 2201, paga_em: null },
    { referencia: "2026-08-01", vencimento: "2026-08-30", status: "paga", total_centavos: 9010, economia_centavos: 3010, paga_em: "2026-08-28" },
  ],
};

test("instruções trazem a fatura em aberto e a economia do cliente", () => {
  const p = instrucoesAtendente(base);
  assert.match(p, /R\$\s88,05/); // o separador do Intl é espaço fixo
  assert.match(p, /vence em 30\/09\/2026/);
  assert.match(p, /R\$\s52,11/);
});

test("instruções proíbem cálculo e negociação", () => {
  const p = instrucoesAtendente(base);
  assert.match(p, /NUNCA faça contas/);
  assert.match(p, /NÃO negocie/);
});

test("sem fatura em aberto avisa que não há", () => {
  assert.match(instrucoesAtendente({ ...base, faturas: [] }), /Fatura em aberto: nenhuma/);
});

test("só pode citar o telefone cadastrado", () => {
  const p = instrucoesAtendente(base);
  assert.match(p, /\(77\) 99999-0000/);
  assert.match(p, /NUNCA escreva telefone/);
});

test("sem telefone cadastrado, manda usar o botão", () => {
  const p = instrucoesAtendente({ ...base, contato: null });
  assert.match(p, /WhatsApp da usina: não informado/);
  assert.match(p, /Não há telefone informado/);
});
