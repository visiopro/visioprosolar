import {contexto} from '@/lib/usina';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {mesmaOrigem} from '@/lib/gmail/api';
export async function POST(req:Request) {
 const {usina,papel}=await contexto();
 try{
  if(papel!=='dono'||!mesmaOrigem(req)) return Response.json({erro:'Não autorizado.'},{status:403});
  const {data,error}=await supabaseAdmin().from('gmail_conexoes').delete().eq('usina_id',usina.id).or(`lock_ate.is.null,lock_ate.lt.${new Date().toISOString()}`).select('usina_id').maybeSingle();
  if(error||!data) return Response.json({erro:'Aguarde a sincronização atual terminar e tente novamente.'},{status:409});
  await supabaseAdmin().from('gmail_oauth_estados').delete().eq('usina_id',usina.id);
  return Response.json({ok:'Conexão removida do VisioPro. Os PDFs importados foram preservados. Você também pode revogar a autorização na sua Conta Google.'});
 }catch{return Response.json({erro:'Não foi possível desconectar.'},{status:500});}
}
