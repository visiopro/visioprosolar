import { test } from "node:test";
import assert from "node:assert/strict";
import { legendaWhatsapp } from "./legenda.ts";

const baseFatura = {
  referencia: "2026-09-01",
  vencimento: "2026-10-10",
  consumo_kwh: 149,
  compensada_kwh: 149,
  tarifa: 1.18869819,
  bandeira_centavos: 379,
  iluminacao_centavos: 2500,
  sem_usina_centavos: 20591,
  total_centavos: 16473,
  economia_centavos: 4118,
  pix_copia_cola: "00020126580014br.gov.bcb.pix...",
  portal_token: "token-abc-123",
  snapshot: {
    cliente: {
      nome: "Wellington Luiz de Andrade",
      documento: "03431828400",
      uc: "850955402891",
      distribuidora: "Coelba",
    },
    usina: {
      nome: "Leão Usina Solar",
      documento: "01350456578",
      pix_favorecido: "Helder Leão",
    },
  },
};

test("texto padrão destaca valor, vencimento e economia", () => {
  const msg = legendaWhatsapp(baseFatura);

  assert.match(msg, /\*Leão Usina Solar\* ☀️/);
  assert.match(msg, /_Fatura de 09\/2026_/);
  assert.match(msg, /Olá, Wellington! Sua fatura já está disponível\./);
  assert.match(msg, /💚 \*R\$\s*164,73\*/);
  assert.match(msg, /📅 Vence em 10\/10\/2026/);
  assert.match(msg, /Você economizou \*R\$\s*41,18\* este mês\./);
  assert.match(msg, /conta seria R\$\s*205,91/);
  assert.match(msg, /\/c\/token-abc-123/);
  // o código PIX vai em mensagem separada, não na legenda
  assert.doesNotMatch(msg, /00020126580014/);
});

test("texto próprio da usina substitui as variáveis", () => {
  const msg = legendaWhatsapp(baseFatura, "Oi {{cliente}}, {{usina}} informa: {{valor}} até {{vencimento}}. Consumo {{consumo}}.");

  assert.match(msg, /Oi Wellington, Leão Usina Solar informa: R\$\s*164,73 até 10\/10\/2026\./);
  assert.match(msg, /Consumo 149 kWh/);
});

test("variáveis de bandeira e iluminação ficam disponíveis", () => {
  const msg = legendaWhatsapp({ ...baseFatura, bandeira_centavos: 0, iluminacao_centavos: 0, sem_usina_centavos: 10000 }, "Bandeira {{bandeira}} · energia {{energia}}");

  assert.match(msg, /Bandeira Verde/);
  assert.match(msg, /energia R\$\s*100,00/);
});

test("fatura já paga manda confirmação, sem PIX", () => {
  const msg = legendaWhatsapp({ ...baseFatura, status: "paga", paga_em: "2026-10-05T12:00:00Z" });

  assert.match(msg, /✅ Pagamento confirmado em 05\/10\/2026\./);
  assert.doesNotMatch(msg, /Pague pelo PIX/);
});
