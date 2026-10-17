import {contexto} from '@/lib/usina';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {mesmaOrigem} from '@/lib/gmail/api';
import {validarRemetentes} from '@/lib/gmail/seguranca';
export async function POST(req:Request) {
 const {usina,papel}=await contexto();
 try {
  if(papel!=='dono'||!mesmaOrigem(req)) return Response.json({erro:'Não autorizado.'},{status:403});
  const b=await req.json(); const remetentes=validarRemetentes(b.remetentes);
  const dias=Number(b.dias); if(!Number.isInteger(dias)||dias<1||dias>365) return Response.json({erro:'Escolha de 1 a 365 dias.'},{status:400});
  const {data,error}=await supabaseAdmin().from('gmail_conexoes').update({remetentes,buscar_desde:new Date(Date.now()-dias*86400000).toISOString(),janela_fim:null,pagina:null,erro:null}).eq('usina_id',usina.id).or(`lock_ate.is.null,lock_ate.lt.${new Date().toISOString()}`).select('usina_id').maybeSingle();
  if(error||!data) return Response.json({erro:'Conecte o Gmail ou aguarde a sincronização atual terminar.'},{status:409});
  const fila=await supabaseAdmin().from('gmail_mensagens').update({status:'pendente',tentativas:0,proxima_tentativa:new Date().toISOString(),erro:null}).eq('usina_id',usina.id).eq('status','erro');
  if(fila.error) return Response.json({erro:'Filtro salvo, mas não foi possível reabrir as tentativas. Tente novamente.'},{status:500});
  return Response.json({ok:'Filtro salvo. A próxima busca usará esse período; documentos iguais serão ignorados.'});
 }catch(e){return Response.json({erro:e instanceof Error?e.message:'Falha ao configurar.'},{status:400});}
}
