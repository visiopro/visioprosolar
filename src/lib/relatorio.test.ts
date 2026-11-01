import { test } from "node:test";
import assert from "node:assert/strict";
import { montarRelatorio, type FaturaRelatorio } from "./relatorio.ts";

const f = (o: Partial<FaturaRelatorio>): FaturaRelatorio => ({
  id: "x", numero: 1, referencia: "2026-10-01", status: "pendente", consumo_kwh: 0, compensada_kwh: 0,
  sem_usina_centavos: 0, total_centavos: 0, valor_recebido_centavos: null, custo_usina_centavos: 0,
  cliente: "C", uc: "1", ...o,
});

test("lucro = faturas − contas mínimas; resultado tira as outras despesas", () => {
  const r = montarRelatorio(
    [
      f({ id: "a", cliente: "Loja Bom Jesus", consumo_kwh: 513, sem_usina_centavos: 68327, total_centavos: 51245, custo_usina_centavos: 6078 }),
      f({ id: "b", cliente: "Apoio", status: "paga", consumo_kwh: 203, total_centavos: 18005, valor_recebido_centavos: 18005, custo_usina_centavos: 5735 }),
      f({ id: "c", status: "cancelada", consumo_kwh: 999, total_centavos: 99999, custo_usina_centavos: 100 }),
    ],
    [
      { valor_centavos: 6078, vencimento: "2026-11-10", categoria: "conta_distribuidora", fatura_id: "a" },
      { valor_centavos: 35000, vencimento: "2026-10-15", categoria: "limpeza", fatura_id: null },
    ],
  );
  assert.equal(r.linhas.length, 2);
  assert.equal(r.kwh, 716);
  assert.equal(r.bruto, 69250);
  assert.equal(r.recebido, 18005);
  assert.equal(r.contasMinimas, 11813);
  assert.equal(r.lucroLiquido, 57437);
  assert.equal(r.outrasDespesas, 35000);
  assert.equal(r.resultado, 22437);
  assert.equal(r.linhas[0].cliente, "Loja Bom Jesus");
  assert.equal(r.linhas[0].lucro, 45167);
});

test("modo energia compensada: kWh vendido = compensada", () => {
  const r = montarRelatorio([f({ consumo_kwh: null, compensada_kwh: 300, total_centavos: 20000 })], []);
  assert.equal(r.kwh, 300);
});
