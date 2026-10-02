import { test } from "node:test";
import assert from "node:assert/strict";
import { montarBoasVindas, PADRAO } from "./boas-vindas.ts";

const base = {
  cliente: "José Luís Abade",
  usina: "Usina Solar Planalto",
  uc: "3714154",
  distribuidora: "Coelba",
  regra: "Desconto de 20% sobre a conta de energia",
  portal: "https://solar.visiopro.app.br/c/abc",
};

test("texto padrão usa o primeiro nome e a regra do cliente", () => {
  const t = montarBoasVindas({ ...base, texto: null });
  assert.match(t, /Olá, José!/);
  assert.match(t, /desconto de 20% sobre a conta de energia/);
  assert.match(t, /3714154 \(Coelba\)/);
  assert.match(t, /solar\.visiopro\.app\.br\/c\/abc/);
});

test("texto próprio da usina substitui as variáveis", () => {
  const t = montarBoasVindas({ ...base, texto: "Oi {{cliente}}, aqui é a {{usina}}. Portal: {{portal}}" });
  assert.equal(t, "Oi José, aqui é a Usina Solar Planalto. Portal: https://solar.visiopro.app.br/c/abc");
});

test("variável desconhecida fica como está", () => {
  assert.match(montarBoasVindas({ ...base, texto: "Olá {{inexistente}}" }), /\{\{inexistente\}\}/);
});

test("o padrão exportado tem as variáveis principais", () => {
  for (const v of ["cliente", "usina", "uc", "portal"]) assert.ok(PADRAO.includes(`{{${v}}}`));
});
