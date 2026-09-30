import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularMensalidade } from "./assinatura";

const p = { preco_ate_30_centavos: 600, preco_acima_centavos: 800, minimo_centavos: 0 };

test("até 30 clientes cobra R$ 6 cada", () => {
  assert.equal(calcularMensalidade(12, p), 7200);
  assert.equal(calcularMensalidade(30, p), 18000);
});

test("acima de 30 é escalonado: 30 * 6 + resto * 8", () => {
  assert.equal(calcularMensalidade(40, p), 26000);
  assert.equal(calcularMensalidade(31, p), 18800);
});

test("respeita o mínimo quando houver", () => {
  assert.equal(calcularMensalidade(5, { ...p, minimo_centavos: 9900 }), 9900);
});
