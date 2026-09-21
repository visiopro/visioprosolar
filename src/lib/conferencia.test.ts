import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirVariacao, type HistoricoCliente } from "./conferencia.ts";

const h: HistoricoCliente = {
  cliente_id: "1",
  referencia: "2026-08-01",
  consumo_kwh: 149,
  tarifa: 1.18869819,
  total_centavos: 14473,
  referencias: ["2026-08-01", "2026-07-01"],
};

test("tarifa lida com dígito errado vira alerta", () => {
  const a = conferirVariacao({ historico: h, referencia: "2026-09", consumoKwh: 149, tarifa: 1.38, totalCentavos: null });
  assert.equal(a.length, 1);
  assert.equal(a[0].campo, "tarifa");
});

test("variação pequena não alerta", () => {
  const a = conferirVariacao({ historico: h, referencia: "2026-09", consumoKwh: 152, tarifa: 1.2, totalCentavos: null });
  assert.equal(a.length, 0);
});

test("mês já faturado bloqueia", () => {
  const a = conferirVariacao({ historico: h, referencia: "2026-08", consumoKwh: 149, tarifa: 1.18869819, totalCentavos: null });
  assert.ok(a.some((x) => x.campo === "referencia" && x.grave));
});

test("consumo muito fora alerta", () => {
  const a = conferirVariacao({ historico: h, referencia: "2026-09", consumoKwh: 600, tarifa: 1.18869819, totalCentavos: null });
  assert.ok(a.some((x) => x.campo === "consumo"));
});

test("cliente novo não alerta", () => {
  assert.equal(conferirVariacao({ historico: null, referencia: "2026-09", consumoKwh: 800, tarifa: 2, totalCentavos: null }).length, 0);
});
