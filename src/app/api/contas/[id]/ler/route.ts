import {contexto} from '@/lib/usina';
import {mesmaOrigem} from '@/lib/gmail/api';
import {lerImportada} from '@/lib/gmail/sync';
export const runtime='nodejs';
export const maxDuration=90;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const {usina}=await contexto();
 try{
  if(!mesmaOrigem(req)) return Response.json({erro:'Origem inválida.'},{status:403});
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({erro:'Conta inválida.'},{status:400});
  return Response.json(await lerImportada(usina.id,id));
 }catch{return Response.json({erro:'Não foi possível processar a conta.'},{status:500});}
}
