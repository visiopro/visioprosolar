import test from "node:test";
import assert from "node:assert/strict";
import { acharLinhaNoTexto, formatarLinha, validarLinhaArrecadacao, valorDaLinha } from "./boleto.ts";

const LINHA = "826600000010726500480009000000000000000000000000";

test("linha de arrecadação válida passa e devolve o valor", () => {
  assert.equal(validarLinhaArrecadacao(formatarLinha(LINHA)), LINHA);
  assert.equal(valorDaLinha(LINHA), 17265);
});

test("um dígito trocado é recusado", () => {
  const errada = LINHA.slice(0, 20) + (LINHA[20] === "1" ? "2" : "1") + LINHA.slice(21);
  assert.equal(validarLinhaArrecadacao(errada), null);
  assert.equal(validarLinhaArrecadacao("12345"), null);
});

test("acha a linha no texto do PDF e confere o valor da conta", () => {
  const texto = `Total a pagar R$ 172,65\nCódigo de barras: ${formatarLinha(LINHA)}\nOutro número 123`;
  assert.equal(acharLinhaNoTexto(texto, 17265), LINHA);
  assert.equal(acharLinhaNoTexto(texto, 99999), null);
  assert.equal(acharLinhaNoTexto("sem código", null), null);
});
