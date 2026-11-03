import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFatura } from "./calculo.ts";
import { gerarPix } from "./pix.ts";

test("conta cheia: conta real de 09/2026 com bandeira", () => {
  // 149 kWh × 1,18869819 = 177,12 + bandeira 3,79 = 180,91; 20% → 144,73
  const r = calcularFatura({ modo: "percentual_conta_cheia", descontoValor: 20, consumoKwh: 149, tarifa: 1.18869819, bandeiraCentavos: 379, iluminacaoCentavos: 0, valorContaCentavos: 4500 });
  assert.equal(r.energiaCentavos, 17712);
  assert.equal(r.semUsinaCentavos, 18091);
  assert.equal(r.totalCentavos, 14473);
  assert.equal(r.economiaCentavos, 3618);
});

test("conta cheia com iluminação pública", () => {
  const r = calcularFatura({ modo: "percentual_conta_cheia", descontoValor: 20, consumoKwh: 100, tarifa: 1, bandeiraCentavos: 0, iluminacaoCentavos: 1500 });
  assert.equal(r.semUsinaCentavos, 11500);
  assert.equal(r.totalCentavos, 9200);
});

test("conta cheia com valor ajustado pelo dono", () => {
  const r = calcularFatura({ modo: "percentual_conta_cheia", descontoValor: 20, tarifa: 0, semUsinaAjustadoCentavos: 10000 });
  assert.equal(r.totalCentavos, 8000);
});

test("modo compensada exige compensação", () => {
  assert.throws(() => calcularFatura({ modo: "percentual_compensada", descontoValor: 20, tarifa: 1, compensadaKwh: 0 }), /créditos/);
});

test("percentual sobre energia compensada", () => {
  const r = calcularFatura({ modo: "percentual_compensada", descontoValor: 20, compensadaKwh: 380, tarifa: 0.912 });
  assert.equal(r.totalCentavos, 27725);
});

test("percentual sobre gasto total mantém a economia prometida", () => {
  const r = calcularFatura({ modo: "percentual_gasto_total", descontoValor: 15, compensadaKwh: 380, tarifa: 0.912, valorContaCentavos: 5840 });
  assert.equal(5840 + r.totalCentavos, Math.round(40496 * 0.85));
});

test("tarifa fixa", () => {
  const r = calcularFatura({ modo: "tarifa_fixa", descontoValor: 0.7, compensadaKwh: 100, tarifa: 0.9 });
  assert.equal(r.totalCentavos, 7000);
});

test("pix tem CRC válido", () => {
  const p = gerarPix({ chave: "12345678000199", favorecido: "Usina Sol", cidade: "Vitória da Conquista", centavos: 27725 })!;
  assert.match(p, /^000201.*6304[0-9A-F]{4}$/);
});

import { normalizarChavePix } from "./pix.ts";
test("normaliza chave PIX para o formato do DICT", () => {
  assert.equal(normalizarChavePix("11.222.333/0001-81")?.chave, "11222333000181");
  assert.equal(normalizarChavePix("529.982.247-25")?.chave, "52998224725");
  assert.equal(normalizarChavePix("(77) 99812-3456")?.chave, "+5577998123456");
  assert.equal(normalizarChavePix("+55 77 99812-3456")?.chave, "+5577998123456");
  assert.equal(normalizarChavePix(" Usina@Email.com ")?.chave, "usina@email.com");
  assert.equal(normalizarChavePix("123E4567-E89B-12D3-A456-426614174000")?.chave, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(normalizarChavePix("abc"), null);
  const p = gerarPix({ chave: "(77) 99812-3456", favorecido: "Usina", cidade: "Conquista", centavos: 100 })!;
  assert.ok(p.includes("0114+5577998123456"));
});

import { pixDaFatura } from "./pix.ts";
test("com cobrança automática a chave fixa nunca vai para o cliente", () => {
  assert.equal(pixDaFatura({ pix_copia_cola: "fixo", cobranca_id: null }, "mercadopago"), null);
  assert.equal(pixDaFatura({ pix_copia_cola: "dinamico", cobranca_id: "123" }, "mercadopago"), "dinamico");
  assert.equal(pixDaFatura({ pix_copia_cola: "fixo", cobranca_id: null }, "nenhum"), "fixo");
});
