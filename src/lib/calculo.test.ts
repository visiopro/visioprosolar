import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFatura } from "./calculo.ts";
import { gerarPix } from "./pix.ts";

test("percentual sobre energia compensada", () => {
  const r = calcularFatura({ modo: "percentual_compensada", descontoValor: 20, compensadaKwh: 380, tarifa: 0.912, valorContaCentavos: 5840 });
  assert.equal(r.baseCentavos, 34656);
  assert.equal(r.totalCentavos, 27725);
  assert.equal(r.economiaCentavos, 6931);
});

test("percentual sobre gasto total mantém a economia prometida", () => {
  const r = calcularFatura({ modo: "percentual_gasto_total", descontoValor: 15, compensadaKwh: 380, tarifa: 0.912, valorContaCentavos: 5840 });
  assert.equal(r.semUsinaCentavos, 40496);
  // conta + fatura = 85% do sem usina
  assert.equal(5840 + r.totalCentavos, Math.round(40496 * 0.85));
});

test("tarifa fixa", () => {
  const r = calcularFatura({ modo: "tarifa_fixa", descontoValor: 0.7, compensadaKwh: 100, tarifa: 0.9, valorContaCentavos: 0 });
  assert.equal(r.totalCentavos, 7000);
  assert.equal(r.economiaCentavos, 2000);
});

test("rejeita fatura zerada", () => {
  assert.throws(() => calcularFatura({ modo: "percentual_compensada", descontoValor: 100, compensadaKwh: 10, tarifa: 1, valorContaCentavos: 0 }));
});

test("pix tem CRC válido", () => {
  const p = gerarPix({ chave: "12345678000199", favorecido: "Usina Sol", cidade: "Vitória da Conquista", centavos: 27725 })!;
  assert.match(p, /^000201.*6304[0-9A-F]{4}$/);
  assert.ok(p.includes("5406277.25"));
});
