import 'server-only';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {obterLeitor} from '@/lib/leitor';
import {emitirAutomatico} from '@/lib/emissao-auto';
import {acharLinhaNoTexto} from '@/lib/boleto';
import {registrarContaAPagar} from '@/lib/contas-pagar';
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
  // código de barras: o texto do próprio PDF é exato; a leitura da IA fica de reserva (as duas passam pelos dígitos verificadores)
  const valorCentavos=leitura.valor_conta!==null?Math.round(leitura.valor_conta*100):null;
  leitura.codigo_barras=(await textoDoPdf(new Uint8Array(bytes)).then(t=>acharLinhaNoTexto(t,valorCentavos)).catch(()=>null))??leitura.codigo_barras??null;
  const cliente=leitura.uc?await db.from('clientes').select('id').eq('usina_id',usinaId).eq('ativo',true).eq('uc',leitura.uc).maybeSingle():{data:null,error:null};conferirErro(cliente.error);
  const clienteId=cliente.data?.id??(leitura.uc&&leitura.titular?await cadastrarClienteDaConta(db,usinaId,leitura.uc,leitura.titular,leitura.distribuidora,leitura.endereco??null):null);
  await atualizar({leitura_ia:leitura,cliente_id:clienteId,uc:leitura.uc,referencia:leitura.referencia?`${leitura.referencia}-01`:null,codigo_barras:leitura.codigo_barras,importacao_status:'pronta',importacao_erro:null});
  // conta no nome da usina: já entra em "A pagar" do financeiro, com o código de barras, mesmo antes de virar fatura
  if(clienteId&&valorCentavos&&leitura.vencimento_conta&&leitura.referencia) {
   const {data:cli}=await db.from('clientes').select('id, nome, distribuidora, modo_desconto').eq('id',clienteId).maybeSingle();
   if(cli?.modo_desconto==='percentual_conta_cheia') await registrarContaAPagar(db,{usinaId,contaId,cliente:cli,referencia:leitura.referencia,valorCentavos,vencimento:leitura.vencimento_conta,codigoBarras:leitura.codigo_barras??null}).catch(()=>{});
  }
  // usina com emissão automática: conta limpa já vira fatura e vai para o cliente
  const auto=await emitirAutomatico(usinaId,contaId).catch(()=>({motivo:'falha na emissão automática.'}));
  if('id' in auto&&auto.id) return {ok:'Leitura concluída e fatura emitida automaticamente.'};
  return {ok:'Leitura concluída. Confira os dados antes de emitir.'};
 }catch{
  await atualizar({importacao_status:'erro',importacao_erro:'A leitura automática falhou. Tente novamente ou confira o PDF manualmente.'});
  return {erro:'A leitura automática falhou. O PDF foi preservado para conferência.'};
 }
}

/**
 * UC ainda não cadastrada: cria o cliente com o nome do titular da conta e a mesma regra de cobrança
 * mais usada pelos clientes da usina. Fica marcado como cadastro automático para completar o WhatsApp depois.
 */
async function cadastrarClienteDaConta(db:ReturnType<typeof supabaseAdmin>,usinaId:string,uc:string,titular:string,distribuidora:string|null,endereco:string|null):Promise<string|null> {
 const {data:existentes}=await db.from('clientes').select('id, uc, ativo, modo_desconto, desconto_valor, cip_modo, cip_valor, cip_tabela_id, cip_classe, distribuidora').eq('usina_id',usinaId).order('created_at',{ascending:false}).limit(200);
 if(existentes?.some(c=>c.uc===uc)) return null; // UC de cliente inativo: não recria
 const contagem=new Map<string,{n:number;c:NonNullable<typeof existentes>[number]}>();
 for(const c of (existentes??[]).filter(c=>c.ativo)) {
  const k=[c.modo_desconto,c.desconto_valor,c.cip_modo,c.cip_valor,c.cip_tabela_id,c.cip_classe].join('|');
  const atual=contagem.get(k);contagem.set(k,{n:(atual?.n??0)+1,c:atual?.c??c});
 }
 const modelo=[...contagem.values()].sort((a,b)=>b.n-a.n)[0]?.c;
 const linha={
  // conta cheia: a conta vem no nome da usina (titular = dono), então o nome real do cliente não está nela
  usina_id:usinaId,nome:(modelo?.modo_desconto==='percentual_conta_cheia'?`UC ${uc}${endereco?` · ${endereco}`:''}`:titular).slice(0,120),uc,
  distribuidora:modelo?.distribuidora??(distribuidora||'Coelba (Neoenergia)'),
  modo_desconto:modelo?.modo_desconto??'percentual_conta_cheia',desconto_valor:modelo?.desconto_valor??20,
  cip_modo:modelo?.cip_modo??'da_conta',cip_valor:modelo?.cip_valor??0,cip_tabela_id:modelo?.cip_tabela_id??null,cip_classe:modelo?.cip_classe??null,
  cadastro_automatico:true,
 };
 const novo=await db.from('clientes').insert(linha).select('id').single();
 if(novo.error) {
  // duas contas da mesma UC lidas ao mesmo tempo: a outra já criou
  if(novo.error.code==='23505') {const j=await db.from('clientes').select('id').eq('usina_id',usinaId).eq('uc',uc).eq('ativo',true).maybeSingle();return j.data?.id??null;}
  return null;
 }
 await db.from('eventos').insert({usina_id:usinaId,acao:'cliente_automatico',alvo_id:novo.data.id,detalhes:{uc,titular,endereco}});
 return novo.data.id;
}

/** Texto do PDF (camada de texto das contas digitais), para achar a linha digitável exata */
async function textoDoPdf(bytes:Uint8Array):Promise<string> {
 const mupdf=await import('mupdf');
 const doc=mupdf.Document.openDocument(bytes,'application/pdf');
 try {
  let texto='';
  for(let i=0;i<Math.min(doc.countPages(),3);i++) {const pg=doc.loadPage(i);texto+=pg.toStructuredText('preserve-whitespace').asText()+'\n';pg.destroy();}
  return texto;
 } finally {doc.destroy();}
}

/**
 * Contas já lidas antes do código de barras existir: tira a linha digitável do PDF e põe na conta a pagar.
 * Roda junto com a busca de hora em hora, poucas por vez.
 */
export async function completarCodigos(usinaId:string,limite=15) {
 const db=supabaseAdmin();
 const {data:contas}=await db.from('contas_energia').select('id, arquivo_path, arquivo_tipo, leitura_ia, cliente_id').eq('usina_id',usinaId).is('codigo_barras',null).eq('arquivo_tipo','application/pdf').not('leitura_ia','is',null).gte('created_at',new Date(Date.now()-60*86400000).toISOString()).order('created_at',{ascending:false}).limit(limite);
 let feitas=0;
 for(const c of contas??[]) {
  try {
   const l=c.leitura_ia as {valor_conta?:number|null;vencimento_conta?:string|null;referencia?:string|null};
   const arq=await db.storage.from('contas').download(c.arquivo_path);
   if(!arq.data) continue;
   const valor=l.valor_conta!=null?Math.round(l.valor_conta*100):null;
   const codigo=await textoDoPdf(new Uint8Array(await arq.data.arrayBuffer())).then(t=>acharLinhaNoTexto(t,valor)).catch(()=>null);
   // marca como verificada mesmo sem código (string vazia) para não tentar de novo
   await db.from('contas_energia').update({codigo_barras:codigo??''}).eq('id',c.id);
   if(!codigo||!c.cliente_id||!valor||!l.vencimento_conta||!l.referencia) continue;
   const {data:cli}=await db.from('clientes').select('id, nome, distribuidora, modo_desconto').eq('id',c.cliente_id).maybeSingle();
   if(cli?.modo_desconto!=='percentual_conta_cheia') continue;
   const {data:desp}=await db.from('despesas').select('id').eq('usina_id',usinaId).eq('categoria','conta_distribuidora').eq('cliente_id',cli.id).eq('valor_centavos',valor).is('conta_id',null).maybeSingle();
   // conta a pagar antiga (criada na emissão): só completa o código e o vínculo
   if(desp) await db.from('despesas').update({codigo_barras:codigo,conta_id:c.id}).eq('id',desp.id);
   else await registrarContaAPagar(db,{usinaId,contaId:c.id,cliente:cli,referencia:l.referencia,valorCentavos:valor,vencimento:l.vencimento_conta,codigoBarras:codigo});
   feitas++;
  } catch {/* segue para a próxima */}
 }
 return feitas;
}
