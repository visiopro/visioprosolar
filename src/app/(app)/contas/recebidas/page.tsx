import {contexto} from '@/lib/usina';
import {Cabecalho,Cartao,Aviso,BotaoLink} from '@/components/ui';
import {AcaoGmail} from '@/components/gmail-integracao';
export const dynamic='force-dynamic';
const nomes:Record<string,string>={recebida:'Aguardando leitura',lendo:'Em leitura',pronta:'Aguardando conferência',erro:'Falha de leitura',protegida:'PDF com senha'};
export default async function Recebidas({searchParams}:{searchParams:Promise<{pagina?:string}>}) {
 const {supabase,usina,papel}=await contexto(),params=await searchParams;
 const pagina=Math.min(10000,Math.max(1,Math.floor(Number(params.pagina))||1));
 const {data:contas,error,count}=await supabase.from('contas_energia').select('id,nome_arquivo,status,importacao_status,importacao_erro,uc,referencia,created_at,leitura_lock_ate',{count:'exact'}).eq('usina_id',usina.id).eq('origem','gmail').order('created_at',{ascending:false}).range((pagina-1)*30,pagina*30-1);
 return <div className="max-w-4xl space-y-5">
 <Cabecalho titulo="Contas recebidas" sub="PDFs importados do Gmail, buscados automaticamente a cada hora. Confira a UC e os valores antes de emitir a cobrança." acao={<div className="flex flex-wrap items-start gap-2"><AcaoGmail url="/api/integracoes/gmail/atualizar" texto="Atualizar"/>{papel==='dono'?<BotaoLink variante="secundario" href="/integracoes/gmail">Configurar Gmail</BotaoLink>:null}</div>}/>
 {error?<Aviso tipo="erro">Não foi possível carregar as contas. Confira se a migração 0019 foi instalada.</Aviso>:null}
 {!error&&!contas?.length?<Cartao className="p-8 text-center"><p>Nenhuma conta nesta página.</p><p className="mt-2 text-sm text-nevoa">Clique em Atualizar para buscar as contas no Gmail. Elas também são buscadas sozinhas a cada hora.</p></Cartao>:null}
 {contas?.map(c=>{
 const travada=c.leitura_lock_ate&&Date.parse(c.leitura_lock_ate)>Date.now();
 return <Cartao key={c.id} className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="break-all font-semibold">{c.nome_arquivo??'Conta Coelba.pdf'}</h2><p className="mt-1 text-sm text-nevoa">{c.uc?`UC ${c.uc}`:'Cliente ainda não identificado'} · {c.referencia?c.referencia.slice(0,7):'Mês a conferir'}</p></div><span className="text-sm text-sol">{c.status==='faturada'?'Faturada':nomes[c.importacao_status??'recebida']??'Conferir'}</span></div>
 {c.importacao_erro&&c.status!=='faturada'?<Aviso tipo="info">{c.importacao_erro}</Aviso>:null}
 {c.status!=='faturada'?<div className="flex flex-wrap items-start gap-3">{!travada?<BotaoLink variante="secundario" href={`/contas/nova?conta=${c.id}`}>Abrir e conferir</BotaoLink>:<p className="text-sm text-nevoa">Aguarde a leitura terminar e atualize a página.</p>}{!travada&&['recebida','erro','lendo'].includes(c.importacao_status??'')?<AcaoGmail url={`/api/contas/${c.id}/ler`} texto="Ler com IA"/>:null}</div>:null}
 </Cartao>;})}
 <div className="flex items-center justify-between gap-3">{pagina>1?<BotaoLink variante="secundario" href={`/contas/recebidas?pagina=${pagina-1}`}>Anterior</BotaoLink>:<span/>}<span className="text-sm text-nevoa">Página {pagina} · {count??0} conta(s)</span>{(count??0)>pagina*30?<BotaoLink variante="secundario" href={`/contas/recebidas?pagina=${pagina+1}`}>Próxima</BotaoLink>:<span/>}</div>
 </div>;
}
