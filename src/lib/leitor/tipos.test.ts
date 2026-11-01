import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarLeitura } from "./tipos.ts";

const base = { uc: "2.566.155.028-04", referencia: "2026-09", consumo_kwh: 149, valor_conta: 185.14, tusd_quant: 149, tusd_valor: 125.12, te_quant: 149, te_valor: 51.99, tarifa_te: 0.348932 };

test("soma TUSD + TE e aceita quando fecha com o valor das linhas", () => {
  const l = normalizarLeitura({ ...base, tarifa_tusd: 0.83976619 });
  assert.equal(l.tarifa, 1.18869819);
  assert.equal(l.uc, "256615502804");
  assert.ok(!l.duvidosos.includes("tarifa"));
});

test("marca a tarifa quando um dígito foi mal lido", () => {
  const l = normalizarLeitura({ ...base, tarifa_tusd: 0.83868718 });
  assert.ok(l.duvidosos.includes("tarifa"));
});

test("conta com créditos: consumo real pelas leituras e bandeira proporcional", () => {
  // Coelba 07/2026: medidor 5.568 → 5.659 (91 kWh), faturado 11,10 kWh, bandeira R$ 0,27
  const l = normalizarLeitura({
    uc: "0003714154", referencia: "2026-07", valor_conta: 36.94,
    leitura_anterior: 5568, leitura_atual: 5659, constante_medidor: 1, consumo_kwh: 11.1,
    tarifa_tusd: 0.8372422, tusd_quant: 11.1, tusd_valor: 9.29,
    tarifa_te: 0.34788326, te_quant: 11.1, te_valor: 3.86,
    bandeira: 0.27,
  });
  assert.equal(l.uc, "3714154");
  assert.equal(l.consumo_kwh, 91);
  assert.equal(l.consumo_faturado_kwh, 11.1);
  assert.equal(l.tarifa, 1.18512546);
  assert.equal(l.bandeira, 2.21);
  assert.ok(!l.duvidosos.includes("tarifa"));
});

// Coelba 10/2026 (Apoio Militar Fábrica): medidor 8.936 → 9.139, faturado 0, compensado 203, sem linha de bandeira
const compensada = {
  uc: "4.413.372.028-00", referencia: "2026-10", valor_conta: 57.35,
  leitura_anterior: 8936, leitura_atual: 9139, constante_medidor: 1, consumo_kwh: 0, compensada_kwh: 203,
  tarifa_tusd: 0.83544863, tusd_quant: 0, tusd_valor: 0, tarifa_te: 0.34713801, te_quant: 0, te_valor: 0,
  bandeira: 0, aliquota_icms: 20.5, aliquota_pis: 1.18, aliquota_cofins: 5.46,
};

test("bandeira verde na conta: zero, sem pedir conferência", () => {
  const l = normalizarLeitura({ ...compensada, bandeira_vigente: "Verde" });
  assert.equal(l.consumo_kwh, 203);
  assert.equal(l.bandeira, 0);
  assert.equal(l.bandeira_vigente, "verde");
  assert.ok(!l.duvidosos.includes("bandeira"));
  assert.ok(!l.duvidosos.includes("consumo_kwh"));
});

test("conta toda compensada com bandeira amarela: estima sobre o consumo real com tributos", () => {
  const l = normalizarLeitura({ ...compensada, bandeira_vigente: "AMARELA" });
  // 203 × 0,01885 / ((1 − 0,0664) × (1 − 0,205)) = 5,16
  assert.equal(l.bandeira, 5.16);
  assert.ok(l.duvidosos.includes("bandeira"));
});

test("vermelha patamar 2 é reconhecida", () => {
  const l = normalizarLeitura({ ...compensada, bandeira_vigente: "Vermelha Patamar 2" });
  assert.equal(l.bandeira_vigente, "vermelha_2");
  assert.equal(l.bandeira, 21.54);
});

test("bandeira da própria conta prevalece sobre a cor", () => {
  const l = normalizarLeitura({ ...compensada, bandeira: 1.5, bandeira_vigente: "amarela" });
  assert.equal(l.bandeira, 1.5);
});

test("consumo mal lido: não bate com faturado + compensado", () => {
  const l = normalizarLeitura({ ...compensada, leitura_atual: 10069, bandeira_vigente: "verde" });
  assert.equal(l.consumo_kwh, 1133);
  assert.ok(l.duvidosos.includes("consumo_kwh"));
});

test("Bom Jesus 10/2026: 513 = 50 faturado + 463 compensado, sem alerta", () => {
  const l = normalizarLeitura({
    uc: "724978502817", referencia: "2026-10", valor_conta: 60.78,
    leitura_anterior: 1000, leitura_atual: 1513, consumo_kwh: 50, compensada_kwh: 463, bandeira: 0.37,
  });
  assert.equal(l.consumo_kwh, 513);
  assert.equal(l.bandeira, 3.8);
  assert.ok(!l.duvidosos.includes("consumo_kwh"));
});
