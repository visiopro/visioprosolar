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

test("formata resumo completo da fatura com bandeira tarifária", () => {
  const msg = legendaWhatsapp(baseFatura);

  assert.match(msg, /☀️ LEÃO USINA SOLAR/);
  assert.match(msg, /Olá, Wellington Luiz de Andrade! 👋/);
  assert.match(msg, /Sua fatura de energia referente a 09\/2026 já está disponível\./);
  assert.match(msg, /📊 RESUMO DA SUA FATURA/);
  assert.match(msg, /⚡ Consumo: 149 kWh/);
  assert.match(msg, /🏷️ Bandeira tarifária: R\$\s*3,79/);
  assert.match(msg, /💰 Valor da energia: R\$\s*177,12/);
  assert.match(msg, /💡 Iluminação pública: R\$\s*25,00/);
  assert.match(msg, /💵 Valor total sem desconto: R\$\s*205,91/);
  assert.match(msg, /📉 Economia obtida: R\$\s*41,18/);
  assert.match(msg, /💚 VALOR A PAGAR: R\$\s*164,73/);
  assert.match(msg, /📅 Vencimento: 10\/10\/2026/);
  assert.match(msg, /💳 PAGAMENTO VIA PIX/);
  assert.match(msg, /Código PIX Copia e Cola:/);
  assert.match(msg, /00020126580014br\.gov\.bcb\.pix\.\.\./);
  assert.match(msg, /📱 Acompanhe sua fatura e sua economia:/);
  assert.match(msg, /\/c\/token-abc-123/);
  assert.match(msg, /Obrigado pela confiança na Leão Usina Solar! 💚/);
  assert.match(msg, /Qualquer dúvida, é só responder esta mensagem\. Estamos à disposição\./);
});

test("bandeira verde quando não há acréscimo", () => {
  const msg = legendaWhatsapp({
    ...baseFatura,
    bandeira_centavos: 0,
    iluminacao_centavos: 0,
    sem_usina_centavos: 10000,
  });

  assert.match(msg, /🏷️ Bandeira tarifária: Verde/);
  assert.match(msg, /💰 Valor da energia: R\$\s*100,00/);
});

test("fatura já paga exibe aviso de paga", () => {
  const msg = legendaWhatsapp({
    ...baseFatura,
    status: "paga",
    paga_em: "2026-10-05T12:00:00Z",
  });

  assert.match(msg, /✅ Fatura paga em 05\/10\/2026\./);
  assert.doesNotMatch(msg, /💳 PAGAMENTO VIA PIX/);
});
