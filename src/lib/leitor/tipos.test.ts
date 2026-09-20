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
