import 'server-only';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {obterLeitor} from '@/lib/leitor';
import {desbloquearPdf,senhasDaUsina} from '@/lib/pdf-senha';
import {gmail,tokenGoogle,ErroGoogle} from './api';
import {decifrar,consultaGmail,assuntoConfere,anexosPdf,hash,ehPdf,pdfProtegido,type Parte} from './seguranca';

type Conexao={usina_id:string;email:string;refresh_token_enc:string;remetentes:string[];assuntos?:string[];buscar_desde:string;janela_fim:string|null;pagina:string|null};
type Mensagem={payload:Parte & {headers?:{name:string;value:string}[]}};
const MAX_PDF=10*1024*1024;
function conferirErro(error:unknown) {if(error) throw new Error('Falha ao registrar o processamento no banco. Tente novamente.');}
function erroSeguro(e:unknown) {return e instanceof ErroGoogle ? e.message : 'A operação não foi concluída. Confira a configuração e tente novamente.';}

/** Descoberta paginada persistida e fila de mensagens; nenhum envio ou cobrança. */
export async function sincronizar(usinaId:string) {
 const db=supabaseAdmin(),lock=crypto.randomUUID(),inicio=Date.now();
 const {data,error}=await db.rpc('gmail_travar',{p_usina:usinaId,p_lock:lock}); conferirErro(error);
 const c=data?.[0] as Conexao|undefined;
 if(!c) return {ocupado:true,importadas:0,mensagens:0};
 const atualizar=async (v:Record<string,unknown>)=>{const r=await db.from('gmail_conexoes').update(v).eq('usina_id',usinaId).eq('lock_id',lock);conferirErro(r.error);};
 let importadas=0,mensagens=0;
 try {
  const assuntos=c.assuntos??[];
  if(!c.remetentes.length&&!assuntos.length) throw new Error('remetentes');
  const token=await tokenGoogle({grant_type:'refresh_token',refresh_token:decifrar(c.refresh_token_enc,usinaId)});
  const fim=c.janela_fim??new Date().toISOString();
  const qs=new URLSearchParams({q:consultaGmail(c.remetentes,c.buscar_desde,fim,assuntos),maxResults:'20'});
  if(c.pagina) qs.set('pageToken',c.pagina);
  const lista=await gmail<{messages?:{id:string}[];nextPageToken?:string}>(token.access_token,'messages?'+qs);
  const ids=lista.messages??[];
  if(ids.length) {
   const r=await db.from('gmail_mensagens').upsert(ids.map(m=>({usina_id:usinaId,email:c.email,message_id:m.id})),{onConflict:'usina_id,email,message_id',ignoreDuplicates:true});conferirErro(r.error);
  }
  await atualizar(lista.nextPageToken?{janela_fim:fim,pagina:lista.nextPageToken}:{janela_fim:null,pagina:null,buscar_desde:new Date(Date.parse(fim)-86400000).toISOString(),ultima_sincronizacao:fim});
  const fila=await db.from('gmail_mensagens').select('*').eq('usina_id',usinaId).eq('email',c.email).eq('status','pendente').lte('proxima_tentativa',new Date().toISOString()).order('created_at').limit(20);conferirErro(fila.error);
  let falhas=0;
  for(const job of fila.data??[]) {
   if(Date.now()-inicio>35000) break;
   try {
    const m=await gmail<Mensagem>(token.access_token,`messages/${encodeURIComponent(job.message_id)}?format=full`);
    const from=m.payload.headers?.find(h=>h.name.toLowerCase()==='from')?.value??'';
    const remetente=(from.match(/<([^<>]+)>/)?.[1]??from).trim().toLowerCase();
    const assunto=m.payload.headers?.find(h=>h.name.toLowerCase()==='subject')?.value??'';
    if(!c.remetentes.includes(remetente)&&!assuntoConfere(assunto,assuntos)) {
     const r=await db.from('gmail_mensagens').update({status:'concluida',erro:'Remetente e assunto fora do filtro cadastrado; mensagem ignorada.'}).eq('id',job.id).eq('usina_id',usinaId);conferirErro(r.error);continue;
    }
    const partes=anexosPdf(m.payload);
    if(partes.length>30) throw new Error('Muitos anexos. Importe esta mensagem manualmente.');
    let senhas:string[]|undefined;
    for(const p of partes) {
     if(Date.now()-inicio>55000) throw new Error('A mensagem será retomada na próxima sincronização.');
     if((p.body?.size??0)>MAX_PDF) throw new Error('PDF acima de 10 MB. Importe uma versão menor manualmente.');
     const bruto=p.body?.data?{data:p.body.data}:await gmail<{data:string}>(token.access_token,`messages/${encodeURIComponent(job.message_id)}/attachments/${encodeURIComponent(p.body!.attachmentId!)}`);
     const bytes=Buffer.from(bruto.data,'base64url');
     if(!bytes.length||bytes.length>MAX_PDF||!ehPdf(bytes)) throw new Error('Anexo inválido ou acima de 10 MB. Confira no Gmail.');
     const digest=hash(bytes);
     const existe=await db.from('contas_energia').select('id').eq('usina_id',usinaId).eq('origem','gmail').eq('arquivo_sha256',digest).maybeSingle();conferirErro(existe.error);
     if(existe.data) continue;
     const path=`${usinaId}/gmail/${digest}.pdf`;
     // PDF com senha: tenta abrir com CPF/CNPJ da usina e dos clientes e guarda já desbloqueado
     let arquivo:Uint8Array=bytes;
     if(pdfProtegido(bytes)) {try{arquivo=(await desbloquearPdf(bytes,senhas??=await senhasDaUsina(db,usinaId)))??bytes;}catch{arquivo=bytes;}}
     const up=await db.storage.from('contas').upload(path,arquivo,{contentType:'application/pdf',upsert:true});conferirErro(up.error);
     const protegido=pdfProtegido(arquivo);
     const ins=await db.from('contas_energia').insert({usina_id:usinaId,arquivo_path:path,arquivo_tipo:'application/pdf',origem:'gmail',arquivo_sha256:digest,nome_arquivo:(p.filename??'conta.pdf').slice(0,180),importacao_status:protegido?'protegida':'recebida',importacao_erro:protegido?'PDF protegido por senha. Abra o original com a senha do titular e confira manualmente, ou envie uma cópia desbloqueada em Lançar conta.':null});
     if(ins.error?.code!=='23505') {conferirErro(ins.error);importadas++;}
    }
    const r=await db.from('gmail_mensagens').update({status:'concluida',erro:null,tentativas:job.tentativas+1}).eq('id',job.id).eq('usina_id',usinaId);conferirErro(r.error);mensagens++;
   }catch(e){
    falhas++;
    const tentativas=job.tentativas+1;
    const conhecido=e instanceof Error&&/^(PDF acima|Anexo inválido|Muitos anexos|A mensagem será)/.test(e.message);
    const r=await db.from('gmail_mensagens').update({tentativas,status:tentativas>=5?'erro':'pendente',erro:conhecido?(e as Error).message:erroSeguro(e),proxima_tentativa:new Date(Date.now()+Math.min(60,2**tentativas)*60000).toISOString()}).eq('id',job.id).eq('usina_id',usinaId);conferirErro(r.error);
    if(e instanceof ErroGoogle&&e.reconectar) throw e;
   }
  }
  await atualizar({erro:falhas?'Há mensagens com falha; novas tentativas serão feitas automaticamente. Veja as pendências abaixo.':null});
  return {ocupado:false,importadas,mensagens};
 }catch(e){
  const erro=e instanceof Error&&e.message==='remetentes'?'Cadastre o remetente ou o assunto das faturas antes de sincronizar.':erroSeguro(e);
  await atualizar({erro,...(e instanceof ErroGoogle&&e.reconectar?{ativa:false}:{}),...(e instanceof ErroGoogle&&e.status===400&&c.pagina?{pagina:null}: {})});
  return {ocupado:false,importadas,mensagens,erro};
 }finally{await atualizar({lock_id:null,lock_ate:null});}
}

export async function lerImportada(usinaId:string,contaId:string) {
 const leitor=obterLeitor();
 if(!leitor) return {erro:'Configure o provedor de IA ou confira a conta manualmente.'};
 const db=supabaseAdmin(),lock=crypto.randomUUID();
 const r=await db.rpc('gmail_travar_leitura',{p_usina:usinaId,p_conta:contaId,p_lock:lock});conferirErro(r.error);
 const conta=r.data?.[0];
 if(!conta) return {erro:'A conta já foi lida, está protegida, foi faturada ou está em processamento.'};
 const atualizar=async(v:Record<string,unknown>)=>{
  const q=await db.from('contas_energia').update({...v,leitura_lock_id:null,leitura_lock_ate:null}).eq('id',contaId).eq('usina_id',usinaId).eq('leitura_lock_id',lock).eq('status','lida');conferirErro(q.error);
 };
 try {
  const arq=await db.storage.from('contas').download(conta.arquivo_path);conferirErro(arq.error);
  if(!arq.data) throw new Error('Arquivo indisponível.');
  let bytes=await arq.data.arrayBuffer();
  if(pdfProtegido(new Uint8Array(bytes))) {
   const aberto=await desbloquearPdf(new Uint8Array(bytes),await senhasDaUsina(db,usinaId)).catch(()=>null);
   if(aberto) {const up=await db.storage.from('contas').upload(conta.arquivo_path,aberto,{contentType:'application/pdf',upsert:true});conferirErro(up.error);bytes=aberto.buffer.slice(aberto.byteOffset,aberto.byteOffset+aberto.byteLength) as ArrayBuffer;}
  }
  if(pdfProtegido(new Uint8Array(bytes))) {await atualizar({importacao_status:'protegida',importacao_erro:'PDF protegido por senha. Abra o original e confira manualmente.'});return {erro:'PDF protegido por senha.'};}
  const leitura=await leitor.ler({bytes,tipo:'application/pdf'});
  const cliente=leitura.uc?await db.from('clientes').select('id').eq('usina_id',usinaId).eq('ativo',true).eq('uc',leitura.uc).maybeSingle():{data:null,error:null};conferirErro(cliente.error);
  await atualizar({leitura_ia:leitura,cliente_id:cliente.data?.id??null,uc:leitura.uc,referencia:leitura.referencia?`${leitura.referencia}-01`:null,importacao_status:'pronta',importacao_erro:null});
  return {ok:'Leitura concluída. Confira os dados antes de emitir.'};
 }catch{
  await atualizar({importacao_status:'erro',importacao_erro:'A leitura automática falhou. Tente novamente ou confira o PDF manualmente.'});
  return {erro:'A leitura automática falhou. O PDF foi preservado para conferência.'};
 }
}
