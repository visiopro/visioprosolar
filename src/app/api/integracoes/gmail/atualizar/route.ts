import {contexto} from '@/lib/usina';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {mesmaOrigem} from '@/lib/gmail/api';
import {sincronizar,lerImportada} from '@/lib/gmail/sync';
export const runtime='nodejs';
export const maxDuration=60;

/** Botão "Atualizar" das contas recebidas: busca no Gmail e já lê os PDFs novos com IA */
export async function POST(req:Request) {
 const {usina}=await contexto();
 try{
  if(!mesmaOrigem(req)) return Response.json({erro:'Não autorizado.'},{status:403});
  const db=supabaseAdmin(),inicio=Date.now();
  const {data:conexao}=await db.from('gmail_conexoes').select('ativa').eq('usina_id',usina.id).maybeSingle();
  if(!conexao?.ativa) return Response.json({erro:'Conecte o Gmail da usina para buscar as contas.'});
  const sync=await sincronizar(usina.id);
  if(sync.erro) return Response.json({erro:sync.erro});
  if(sync.ocupado) return Response.json({erro:'Já tem uma busca em andamento. Aguarde um minuto e atualize de novo.'});
  // Lê com IA o que chegou, em lotes pequenos, até perto do limite de tempo
  let lidas=0,falhas=0;
  while(Date.now()-inicio<35000) {
   const {data:contas}=await db.from('contas_energia').select('id').eq('usina_id',usina.id).eq('origem','gmail').eq('status','lida').in('importacao_status',['recebida']).lt('leitura_tentativas',3).or(`leitura_lock_ate.is.null,leitura_lock_ate.lt.${new Date().toISOString()}`).order('created_at').limit(2);
   if(!contas?.length) break;
   const r=await Promise.allSettled(contas.map(c=>lerImportada(usina.id,c.id)));
   for(const x of r) { if(x.status==='fulfilled'&&!x.value.erro) lidas++; else falhas++; }
  }
  const partes=[sync.importadas?`${sync.importadas} conta(s) nova(s) do Gmail`:'Nenhuma conta nova no Gmail'];
  if(lidas) partes.push(`${lidas} lida(s) pela IA`);
  if(falhas) partes.push(`${falhas} precisa(m) de conferência manual`);
  return Response.json({ok:partes.join(' · ')+'.'});
 }catch{return Response.json({erro:'Não foi possível atualizar agora. Tente de novo em instantes.'},{status:500});}
}
