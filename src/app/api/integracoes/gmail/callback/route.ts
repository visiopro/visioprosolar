import {NextRequest,NextResponse} from 'next/server';
import {contexto} from '@/lib/usina';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {configGmail,tokenGoogle,gmail,ESCOPO} from '@/lib/gmail/api';
import {hash,iguais,cifrar} from '@/lib/gmail/seguranca';
export const runtime='nodejs';
export async function GET(req:NextRequest) {
 const {user,usina,papel}=await contexto();
 const retorno=(resultado:string)=>{
  const res=NextResponse.redirect(new URL('/integracoes/gmail?resultado='+resultado,req.url));
  res.cookies.set('gmail_oauth_state','',{path:'/api/integracoes/gmail',maxAge:0});
  res.headers.set('Cache-Control','no-store');res.headers.set('Referrer-Policy','no-referrer'); return res;
 };
 const state=req.nextUrl.searchParams.get('state')??'';
 if(papel!=='dono'||!iguais(state,req.cookies.get('gmail_oauth_state')?.value??'')) return retorno('estado');
 const db=supabaseAdmin();
 const {data:estado,error}=await db.from('gmail_oauth_estados').delete().eq('state_hash',hash(state)).eq('user_id',user.id).eq('usina_id',usina.id).gt('expira_em',new Date().toISOString()).select('verifier').maybeSingle();
 if(error||!estado) return retorno('estado');
 if(req.nextUrl.searchParams.has('error')) return retorno('cancelado');
 const code=req.nextUrl.searchParams.get('code'); if(!code) return retorno('estado');
 try {
  const token=await tokenGoogle({code,code_verifier:estado.verifier,redirect_uri:configGmail().redirectUri,grant_type:'authorization_code'});
  if(!token.refresh_token||!token.scope?.split(' ').includes(ESCOPO)) return retorno('permissao');
  const perfil=await gmail<{emailAddress:string}>(token.access_token,'profile');
  const {data:atual,error:errAtual}=await db.from('gmail_conexoes').select('email,lock_ate').eq('usina_id',usina.id).maybeSingle();
  if(errAtual) throw errAtual;
  if(atual?.lock_ate&&Date.parse(atual.lock_ate)>Date.now()) return retorno('ocupado');
  const email=perfil.emailAddress.toLowerCase();
  // Troca de caixa: reinicia a busca. Não reutiliza cursores de outra conta.
  const reset=atual?.email!==email?{remetentes:[],buscar_desde:new Date(Date.now()-60*86400000).toISOString(),janela_fim:null,pagina:null,ultima_sincronizacao:null}:{};
  const {error:e}=await db.from('gmail_conexoes').upsert({usina_id:usina.id,email,refresh_token_enc:cifrar(token.refresh_token,usina.id),ativa:true,erro:null,conectada_em:new Date().toISOString(),...reset},{onConflict:'usina_id'});
  if(e) return retorno(e.code==='23505'?'outra_usina':'falha');
  return retorno('conectado');
 } catch (err) {
  console.error('[GMAIL CALLBACK ERROR]', err);
  return retorno('falha');
 }
}
