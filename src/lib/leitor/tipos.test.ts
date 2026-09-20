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
