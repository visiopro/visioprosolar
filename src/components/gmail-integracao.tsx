'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Botao,Campo,Aviso} from './ui';

export function AcaoGmail({url,texto,confirmar}:{url:string;texto:string;confirmar?:string}) {
 const [busy,start]=useTransition(),[ret,setRet]=useState<{ok?:string;erro?:string}|null>(null),router=useRouter();
 return <div className="space-y-2"><Botao variante="secundario" disabled={busy} onClick={()=>{if(confirmar&&!window.confirm(confirmar))return;start(async()=>{setRet(null);try{const r=await fetch(url,{method:'POST'});const b=await r.json();setRet(b);router.refresh();}catch{setRet({erro:'Falha de conexão. Atualize a página antes de tentar novamente.'});}});}}>{busy?'Processando…':texto}</Botao>{ret?<Aviso tipo={ret.erro?'erro':'ok'}>{ret.erro??ret.ok}</Aviso>:null}</div>;
}
export function FormGmail({remetentes}:{remetentes:string[]}) {
 const [emails,setEmails]=useState(remetentes.join(', ')),[dias,setDias]=useState('60');
 const [busy,start]=useTransition(),[ret,setRet]=useState<{ok?:string;erro?:string}|null>(null),router=useRouter();
 return <form className="space-y-4" onSubmit={e=>{e.preventDefault();start(async()=>{try{const r=await fetch('/api/integracoes/gmail/configurar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({remetentes:emails,dias:Number(dias)})});setRet(await r.json());router.refresh();}catch{setRet({erro:'Não foi possível salvar.'});}});}}>
 <Campo rotulo="Quem envia as faturas da Coelba?" ajuda="Abra uma fatura no Gmail e copie o endereço completo do remetente. Separe endereços diferentes por vírgula (até 5)."><input required className="campo" value={emails} onChange={e=>setEmails(e.target.value)} placeholder="Endereço de e-mail do remetente" maxLength={1300}/></Campo>
 <Campo rotulo="Buscar contas dos últimos"><select className="campo" value={dias} onChange={e=>setDias(e.target.value)}><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="365">1 ano</option></select></Campo>
 <p className="text-sm text-nevoa">Salvar reinicia a busca no período escolhido. PDFs já importados serão reconhecidos para evitar duplicidade.</p>
 <Botao disabled={busy}>{busy?'Salvando…':'Salvar filtro de recebimento'}</Botao>
 {ret?<Aviso tipo={ret.erro?'erro':'ok'}>{ret.erro??ret.ok}</Aviso>:null}
 </form>;
}
