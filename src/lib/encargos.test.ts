import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularEncargo, descreverEncargo, totalEncargos } from "./encargos.ts";

const base = { id: "a", numero: 4, referencia: "2026-10-01", vencimento: "2026-11-12", total_centavos: 17265 };

test("pago 8 dias depois: multa 2% + juros 1% a.m. proporcional", () => {
  const e = calcularEncargo({ ...base, paga_em: "2026-11-20" }, 2, 1)!;
  assert.equal(e.dias, 8);
  assert.equal(e.multa_centavos, 345);
  assert.equal(e.juros_centavos, 46);
  assert.equal(totalEncargos([e]), 391);
  assert.match(descreverEncargo(e), /fatura nº 4 \(10\/2026\), paga 8 dias após o vencimento/);
});

test("pago no dia ou antes: sem encargo", () => {
  assert.equal(calcularEncargo({ ...base, paga_em: "2026-11-12" }, 2, 1), null);
  assert.equal(calcularEncargo({ ...base, paga_em: "2026-11-01" }, 2, 1), null);
});

test("percentuais zerados: sem encargo", () => {
  assert.equal(calcularEncargo({ ...base, paga_em: "2026-12-20" }, 0, 0), null);
});
