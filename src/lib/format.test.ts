import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoVencimento } from "./format.ts";

test("próximo vencimento no dia fixo do cliente", () => {
  assert.equal(proximoVencimento("2026-11-04", 16), "2026-11-16");
  assert.equal(proximoVencimento("2026-11-16", 16), "2026-12-16");
  assert.equal(proximoVencimento("2026-11-20", 16), "2026-12-16");
  assert.equal(proximoVencimento("2026-12-20", 5), "2027-01-05");
  assert.equal(proximoVencimento("2026-11-04", 31), "2026-11-30");
  assert.equal(proximoVencimento("2027-01-31", 31), "2027-02-28");
});
