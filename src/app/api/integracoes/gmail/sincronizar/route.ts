import {contexto} from '@/lib/usina';
import {mesmaOrigem} from '@/lib/gmail/api';
import {sincronizar} from '@/lib/gmail/sync';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(req:Request) {
 const {usina,papel}=await contexto();
 try{
  if(papel!=='dono'||!mesmaOrigem(req)) return Response.json({erro:'Não autorizado.'},{status:403});
  const r=await sincronizar(usina.id);
  return Response.json(r.erro?{erro:r.erro}:r.ocupado?{erro:'Sincronização em andamento ou conexão inativa. Aguarde ou reconecte.'}:{ok:`${r.importadas} PDF(s) novo(s) importado(s). A leitura será feita pelo processamento automático ou pelo botão Ler com IA. Repita a busca para continuar se houver mensagens pendentes.`});
 }catch{return Response.json({erro:'Não foi possível sincronizar. Verifique a configuração e a migração 0019.'},{status:500});}
}
