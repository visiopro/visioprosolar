/** PIX copia e cola estático (padrão EMV do Banco Central) */
const campo = (id: string, valor: string) => id + String(new TextEncoder().encode(valor).length).padStart(2, "0") + valor;

const limpar = (s: string, max: number) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, max);

function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function gerarPix(p: { chave: string; favorecido: string; cidade: string; centavos: number; txid?: string }) {
  if (!p.chave || !p.favorecido || !p.cidade) return null;
  const txid = (p.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", p.chave.trim())) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (p.centavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(p.favorecido, 25)) +
    campo("60", limpar(p.cidade, 15)) +
    campo("62", campo("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
