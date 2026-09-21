import { test } from "node:test";
import assert from "node:assert/strict";
import { cipDaTabela, type FaixaCip } from "./cip.ts";

const faixas: FaixaCip[] = [
  { classe: "B1", consumo_min: 0, consumo_max: 60, tipo: "percentual", valor: 0 },
  { classe: "B1", consumo_min: 61, consumo_max: 200, tipo: "percentual", valor: 5 },
  { classe: "B1", consumo_min: 201, consumo_max: null, tipo: "percentual", valor: 18 },
  { classe: "B3", consumo_min: 0, consumo_max: null, tipo: "fixo", valor: 30 },
];

test("escolhe a faixa pelo consumo do mês", () => {
  assert.equal(cipDaTabela(faixas, "B1", 50, 100), 0);
  assert.equal(cipDaTabela(faixas, "B1", 149, 177.12), 8.86);
  assert.equal(cipDaTabela(faixas, "B1", 1670, 1000), 180);
});

test("faixa de valor fixo ignora o valor da energia", () => {
  assert.equal(cipDaTabela(faixas, "B3", 900, 1500), 30);
});

test("sem faixa cadastrada devolve null", () => {
  assert.equal(cipDaTabela(faixas, "B2", 100, 100), null);
});
