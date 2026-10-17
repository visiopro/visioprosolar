import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { contexto } from '@/lib/usina';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { configGmail, mesmaOrigem, ESCOPO } from '@/lib/gmail/api';
import { hash } from '@/lib/gmail/seguranca';
export const runtime='nodejs';
export async function POST(req:Request) {
 const {user,usina,papel}=await contexto();
 if(papel!=='dono') return new Response('Somente o proprietário pode conectar o Gmail.',{status:403});
 try {
  const c=configGmail();
  if(!mesmaOrigem(req)) return new Response('Origem inválida.',{status:403});
  const state=randomBytes(32).toString('base64url'), verifier=randomBytes(32).toString('base64url');
  const db=supabaseAdmin();
  await db.from('gmail_oauth_estados').delete().lt('expira_em',new Date().toISOString());
  const {error}=await db.from('gmail_oauth_estados').insert({state_hash:hash(state),verifier,user_id:user.id,usina_id:usina.id,expira_em:new Date(Date.now()+600000).toISOString()});
  if(error) throw new Error('Não foi possível iniciar a conexão. Confira a migração 0019.');
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:ESCOPO,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  const res=NextResponse.redirect(url,303);
  res.cookies.set('gmail_oauth_state',state,{httpOnly:true,secure:c.origem.startsWith('https:'),sameSite:'lax',path:'/api/integracoes/gmail',maxAge:600});
  res.headers.set('Cache-Control','no-store'); return res;
 }catch {return NextResponse.redirect(new URL('/integracoes/gmail?resultado=configuracao',req.url),303);}
}
