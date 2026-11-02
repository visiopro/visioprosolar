import {contexto} from '@/lib/usina';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {configGmail} from '@/lib/gmail/api';
import {Cabecalho,Cartao,Aviso,Botao,BotaoLink} from '@/components/ui';
import {AcaoGmail,FormGmail} from '@/components/gmail-integracao';
export const dynamic='force-dynamic';
const resultados:Record<string,string>={conectado:'Gmail conectado. Cadastre o remetente das faturas para iniciar.',estado:'A tentativa de conexão expirou. Clique em Conectar Gmail novamente.',cancelado:'Conexão cancelada no Google.',permissao:'É necessário autorizar a leitura do Gmail. Tente conectar novamente.',falha:'Não foi possível concluir a conexão. Confira a Gmail API, as credenciais e a URL de retorno.',outra_usina:'Este Gmail já está vinculado a outra usina. Use uma caixa exclusiva por usina.',configuracao:'Confira as variáveis de ambiente e execute a migração 0019.',ocupado:'Há uma sincronização em andamento. Aguarde antes de reconectar.'};
export default async function IntegracaoGmail({searchParams}:{searchParams:Promise<{resultado?:string}>}) {
 const {usina,papel}=await contexto();
 if(papel!=='dono') return <Aviso tipo="info">Somente o proprietário da usina pode configurar a conexão. As contas importadas ficam em Contas recebidas.</Aviso>;
 const {resultado}=await searchParams;
 let configuracao:string|null=null;
 try{configGmail();}catch(e){configuracao=e instanceof Error?e.message:'Configuração incompleta.';}
 const db=supabaseAdmin();
 const {data:c,error}=await db.from('gmail_conexoes').select('email,remetentes,assuntos,ativa,ultima_sincronizacao,erro').eq('usina_id',usina.id).maybeSingle();
 const {data:falhas}=error?{data:[]}:await db.from('gmail_mensagens').select('id,erro,tentativas').eq('usina_id',usina.id).eq('email',c?.email??'').not('erro','is',null).neq('status','concluida').order('created_at',{ascending:false}).limit(10);
 return <div className="max-w-3xl space-y-6">
 <Cabecalho titulo="Faturas pelo Gmail" sub="Receba as contas da Coelba no VisioPro e confira os valores antes de cobrar." acao={<BotaoLink href="/contas/recebidas" variante="secundario">Contas recebidas</BotaoLink>}/>
 {resultado&&resultados[resultado]?<Aviso tipo={resultado==='conectado'?'ok':'erro'}>{resultados[resultado]}</Aviso>:null}
 {configuracao?<Aviso tipo="erro">{configuracao}</Aviso>:null}
 {error?<Aviso tipo="erro">A integração ainda não está instalada no banco. Execute supabase/migrations/0019_gmail.sql.</Aviso>:null}
 <Cartao className="space-y-4 p-6">
 <h2 className="text-lg font-semibold">{c?c.email:'Conecte o e-mail da usina'}</h2>
 <p className="text-sm text-nevoa">A autorização do Google permite leitura da caixa. O VisioPro usa o filtro de remetente e assunto abaixo para importar PDFs. Cada usina deve usar sua própria caixa de e-mail.</p>
 <p className="text-sm text-nevoa">Os PDFs importados serão armazenados na usina e enviados ao provedor de IA configurado no aplicativo para extrair os dados. A importação não emite cobranças nem envia mensagens aos clientes.</p>
 {c?<p className="text-sm">{c.ativa?'Conexão ativa':'É necessário reconectar'} · Última busca completa: {c.ultima_sincronizacao?new Date(c.ultima_sincronizacao).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'ainda não realizada'}</p>:null}
 {c?.erro?<Aviso tipo="erro">{c.erro}</Aviso>:null}
 <form action="/api/integracoes/gmail/conectar" method="POST"><Botao disabled={!!configuracao||!!error}>{c?'Reconectar Gmail':'Conectar Gmail'}</Botao></form>
 {c?<AcaoGmail url="/api/integracoes/gmail/desconectar" texto="Desconectar" confirmar="Interromper a importação deste Gmail? Os PDFs já recebidos serão preservados."/>:null}
 </Cartao>
 {c?<Cartao className="space-y-5 p-6"><h2 className="font-semibold">Faturas que serão importadas</h2><FormGmail remetentes={c.remetentes} assuntos={c.assuntos??[]}/>{c.ativa&&(c.remetentes.length||c.assuntos?.length)?<AcaoGmail url="/api/integracoes/gmail/sincronizar" texto="Buscar faturas agora"/>:null}<p className="text-sm text-nevoa">Importamos anexos PDF de até 10 MB, em pequenos lotes. E-mails que contêm apenas links precisam de envio manual. PDFs com senha ficam sinalizados para conferência manual.</p></Cartao>:null}
 {falhas?.length?<Cartao className="space-y-3 p-6"><h2 className="font-semibold">Mensagens com pendência</h2>{falhas.map(f=><p key={f.id} className="text-sm text-alerta">{f.erro} · Tentativas: {f.tentativas}{f.tentativas>=5?' — limite automático atingido; use o envio manual ou salve o filtro para tentar novamente.':''}</p>)}</Cartao>:null}
 </div>;
}
