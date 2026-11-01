import 'server-only';
import { chaveGmail } from './seguranca';
export const ESCOPO = 'https://www.googleapis.com/auth/gmail.readonly';
export function configGmail() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Configure as três variáveis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.');
  const url = new URL(redirectUri);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) || url.pathname !== '/api/integracoes/gmail/callback' || url.search || url.hash) throw new Error('GOOGLE_REDIRECT_URI inválida. Use a URL do app terminando em /api/integracoes/gmail/callback.');
  chaveGmail();
  return { clientId, clientSecret, redirectUri, origem: url.origin };
}
export function mesmaOrigem(req: Request) {
  return req.headers.get('origin') === configGmail().origem;
}
export class ErroGoogle extends Error {
  constructor(public readonly status: number, public readonly reconectar = false) {
    super(reconectar ? 'A autorização do Gmail expirou ou foi revogada. Reconecte a conta.' : `O Gmail não concluiu a consulta (HTTP ${status}). Verifique a API e tente novamente.`);
  }
}
export async function tokenGoogle(parametros: Record<string,string>) {
  const c = configGmail();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id:c.clientId, client_secret:c.clientSecret, ...parametros }),
    signal: AbortSignal.timeout(15_000), cache:'no-store',
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    console.error('[GMAIL TOKEN ERROR]', r.status, b);
    throw new ErroGoogle(r.status, b.error === 'invalid_grant');
  }
  const body = await r.json() as {access_token?:string; refresh_token?:string; scope?:string};
  if (!body.access_token) throw new Error('Google não devolveu um token de acesso.');
  return body as typeof body & {access_token:string};
}
export async function gmail<T>(token: string, caminho: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${caminho}`, {
    headers:{authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(15_000), cache:'no-store',
  });
  if (!r.ok) {
    const b = await r.text().catch(() => '');
    console.error('[GMAIL API ERROR]', r.status, caminho, b);
    throw new ErroGoogle(r.status, r.status === 401);
  }
  return await r.json() as T;
}
