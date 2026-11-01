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

const cpfValido = (d: string) => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
};

const cnpjValido = (d: string) => {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
};

/**
 * Deixa a chave no formato exato do DICT (Banco Central). Chave com pontos, traços,
 * parênteses ou celular sem +55 gera um PIX que o banco recusa com
 * "conta de destinatário inexistente".
 * Retorna null quando não dá para reconhecer a chave.
 */
export function normalizarChavePix(bruta: string): { chave: string; tipo: "cpf" | "cnpj" | "celular" | "email" | "aleatoria" } | null {
  const t = (bruta ?? "").trim();
  if (!t) return null;
  if (t.includes("@")) {
    const email = t.toLowerCase().replace(/\s+/g, "");
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 77 ? { chave: email, tipo: "email" } : null;
  }
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(t)) {
    const h = t.replace(/-/g, "").toLowerCase();
    return { chave: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, tipo: "aleatoria" };
  }
  if (/[^0-9+().\-/\s]/.test(t)) return null;
  const d = t.replace(/\D/g, "");
  const comMais = t.startsWith("+");
  if (!comMais) {
    if (d.length === 14 && cnpjValido(d)) return { chave: d, tipo: "cnpj" };
    if (d.length === 11 && cpfValido(d)) return { chave: d, tipo: "cpf" };
  }
  // celular: DDD + 9 dígitos, com ou sem 55 na frente
  const cel = d.length === 11 ? `55${d}` : d;
  if (/^55\d{2}9\d{8}$/.test(cel)) return { chave: `+${cel}`, tipo: "celular" };
  return null;
}

export function gerarPix(p: { chave: string; favorecido: string; cidade: string; centavos: number; txid?: string }) {
  if (!p.chave || !p.favorecido || !p.cidade) return null;
  const chave = normalizarChavePix(p.chave)?.chave ?? p.chave.trim();
  const txid = (p.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", chave)) +
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
