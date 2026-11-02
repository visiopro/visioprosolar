import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const hash = (valor: string | Uint8Array) => createHash('sha256').update(valor).digest('hex');
export function chaveGmail() {
  const valor = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim() ?? '';
  if (!/^[a-f0-9]{64}$/i.test(valor)) throw new Error('Configure GMAIL_TOKEN_ENCRYPTION_KEY com 64 caracteres hexadecimais.');
  return Buffer.from(valor, 'hex');
}
export function cifrar(texto: string, usina: string, chave = chaveGmail()) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(Buffer.from(`visiopro:gmail:${usina}`));
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
}
export function decifrar(valor: string, usina: string, chave = chaveGmail()) {
  const [v, iv, tag, dados] = valor.split('.');
  if (v !== 'v1' || !iv || !tag || !dados) throw new Error('Credencial inválida. Reconecte o Gmail.');
  const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(`visiopro:gmail:${usina}`));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8');
}
export function iguais(a: string, b: string) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length>0 && x.length===y.length && timingSafeEqual(x,y);
}
export function validarRemetentes(valor: unknown): string[] {
  if (typeof valor !== 'string') throw new Error('Informe o e-mail do remetente das faturas.');
  const lista = [...new Set(valor.split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(Boolean))];
  if (!lista.length || lista.length > 5 || lista.some(x => !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(x) || x.length > 254)) {
    throw new Error('Informe de 1 a 5 endereços de e-mail válidos, separados por vírgula.');
  }
  return lista;
}
/** Termos do assunto: até 5, só letras, números, espaço e - . / (sem operadores do Gmail) */
export function validarAssuntos(valor: unknown): string[] {
  if (valor === undefined || valor === null || valor === '') return [];
  if (typeof valor !== 'string') throw new Error('Assunto inválido.');
  const lista = [...new Set(valor.split(/[,;\n]/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean))];
  if (lista.length > 5 || lista.some(x => x.length < 3 || x.length > 60 || !/^[\p{L}\p{N} .\/-]+$/u.test(x) || /^(or|and)$/i.test(x))) {
    throw new Error('Assunto: até 5 termos de 3 a 60 caracteres (letras, números e espaços), separados por vírgula.');
  }
  return lista;
}
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** O assunto da mensagem contém algum dos termos (sem diferenciar acento e maiúsculas) */
export const assuntoConfere = (assunto: string, termos: string[]) => termos.some(t => semAcento(assunto).includes(semAcento(t)));

export function consultaGmail(remetentes: string[], desde: string, ate: string, assuntos: string[] = []) {
  // Não aceitamos consultas arbitrárias nem URLs fornecidas por e-mail.
  const emails = remetentes.length ? validarRemetentes(remetentes.join(',')) : [];
  const termos = validarAssuntos(assuntos.join(','));
  if (!emails.length && !termos.length) throw new Error('remetentes');
  const filtros = [...emails.map(x => `from:${x}`), ...termos.map(t => `subject:"${t}"`)];
  return `{${filtros.join(' ')}} has:attachment filename:pdf after:${Math.floor(Date.parse(desde)/1000)} before:${Math.floor(Date.parse(ate)/1000)}`;
}
export type Parte = { partId?: string; filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string; size?: number }; parts?: Parte[] };
export function anexosPdf(p: Parte): Parte[] {
  return [...(/\.pdf$/i.test(p.filename ?? '') && p.body && (p.body.data || p.body.attachmentId) ? [p] : []), ...(p.parts ?? []).flatMap(anexosPdf)];
}
export const pdfProtegido = (bytes: Uint8Array) => /\/Encrypt\b/.test(Buffer.from(bytes).toString('latin1'));
export const ehPdf = (bytes: Uint8Array) => Buffer.from(bytes).subarray(0,1024).includes(Buffer.from('%PDF-'));
