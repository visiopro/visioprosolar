import {supabaseAdmin} from '@/lib/supabase/admin';
import {iguais} from '@/lib/gmail/seguranca';
import {sincronizar,lerImportada} from '@/lib/gmail/sync';
import {monitorarWhatsapp} from '@/lib/monitor-whatsapp';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(req:Request) {
 const segredo=process.env.CRON_SECRET;
 if(!segredo||segredo.length<16||!iguais(req.headers.get('authorization')??'',`Bearer ${segredo}`)) return new Response('Não autorizado',{status:401});
 const db=supabaseAdmin(),inicio=Date.now();
 // antes de emitir/enviar: confere se o WhatsApp das usinas está conectado (tenta reiniciar e avisa se não)
 const whatsapp=await monitorarWhatsapp().catch(()=>[]);
 const {data,error}=await db.from('gmail_conexoes').select('usina_id').eq('ativa',true).order('ultima_tentativa',{ascending:true,nullsFirst:true}).limit(20);
 if(error) return Response.json({erro:'Verifique a migração 0019.'},{status:500});
 let processadas=0,falhas=0;
 for(const c of data??[]) {
  if(Date.now()-inicio>170000) break;
  try{
   const sync=await sincronizar(c.usina_id);
   if(sync.erro) falhas++;
   if(sync.ocupado) continue;
   await db.from('contas_energia').update({importacao_status:'recebida'}).eq('usina_id',c.usina_id).eq('origem','gmail').eq('status','lida').eq('importacao_status','erro').lt('leitura_tentativas',3);
   // Leitura em pequenos lotes paralelos; a trava de cada documento evita trabalho duplicado.
   for(let lote=0;lote<3 && Date.now()-inicio<200000;lote++) {
    const {data:contas,error:e}=await db.from('contas_energia').select('id').eq('usina_id',c.usina_id).eq('origem','gmail').eq('status','lida').in('importacao_status',['recebida','lendo']).lt('leitura_tentativas',3).or(`leitura_lock_ate.is.null,leitura_lock_ate.lt.${new Date().toISOString()}`).order('created_at').limit(3);
    if(e) throw e;
    if(!contas?.length) break;
    const resultados=await Promise.allSettled(contas.map(conta=>lerImportada(c.usina_id,conta.id)));
    falhas+=resultados.filter(r=>r.status==='rejected'||r.value.erro).length;
   }
   processadas++;
  }catch{falhas++;}
 }
 return Response.json({processadas,falhas,whatsapp});
}
