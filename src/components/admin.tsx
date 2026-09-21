"use client";

import { useActionState, useState, useTransition } from "react";
import { adicionarFaixaCip, adicionarOperador, criarTabelaCip, criarUsinaComConta, definirInstancia, gerarConvite, redefinirSenha, removerFaixaCip, revogarConvite } from "@/app/admin/actions";
import { CLASSES, type ClasseCip } from "@/lib/cip";
import { Aviso, Botao, Campo } from "./ui";

export function GerarConvite() {
  const [estado, acao, enviando] = useActionState(gerarConvite, undefined);
  const [copiado, setCopiado] = useState(false);
  return (
    <form action={acao} className="space-y-3">
      <div className="flex gap-2">
        <input name="nota" placeholder="Para quem? (ex.: Usina Planalto, João)" className="campo" />
        <Botao disabled={enviando} className="shrink-0">Gerar convite</Botao>
      </div>
      {estado?.codigo ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-campo)] border border-sol/50 bg-sol/5 px-4 py-3">
          <span className="font-mono text-lg tracking-widest text-sol">{estado.codigo}</span>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(estado.codigo!);
              setCopiado(true);
            }}
            className="text-sm text-nevoa hover:text-texto"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      ) : null}
      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
    </form>
  );
}

export function RevogarConvite({ codigo }: { codigo: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button disabled={pendente} onClick={() => iniciar(() => revogarConvite(codigo))} className="text-sm text-nevoa hover:text-erro">
      Revogar
    </button>
  );
}

export function Instancia({ usinaId, atual, temToken }: { usinaId: string; atual: string | null; temToken?: boolean }) {
  const [estado, acao, enviando] = useActionState(definirInstancia.bind(null, usinaId), undefined);
  return (
    <form action={acao} className="space-y-2">
      <input name="instancia" defaultValue={atual ?? ""} placeholder="nome da instância (sem espaço)" className="campo py-1.5 text-sm" />
      <input
        name="token"
        type="password"
        autoComplete="off"
        placeholder={temToken ? "token da instância: ••••••• (cole outro para trocar)" : "token da instância (opcional)"}
        className="campo py-1.5 text-sm"
      />
      {temToken ? (
        <label className="flex items-center gap-2 text-xs text-nevoa">
          <input type="checkbox" name="limpar_token" /> Remover token e usar a chave global
        </label>
      ) : null}
      <div className="flex items-center gap-3">
        <button disabled={enviando} className="text-sm text-sol hover:underline">Salvar</button>
        {estado?.erro ? <span className="text-xs text-erro">{estado.erro}</span> : estado?.ok ? <span className="text-xs text-economia">{estado.ok}</span> : null}
      </div>
    </form>
  );
}

/** Mensagem pronta com login e senha: copiar ou abrir no WhatsApp */
function MensagemAcesso({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-3 rounded-[var(--radius-campo)] border border-sol/50 bg-sol/5 p-4">
      <pre className="whitespace-pre-wrap font-sans text-sm">{texto}</pre>
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
          }}
          className="text-sol hover:underline"
        >
          {copiado ? "Copiado" : "Copiar mensagem"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className="text-sol hover:underline">
          Enviar no WhatsApp
        </a>
      </div>
      <p className="text-xs text-nevoa">A senha aparece só agora. Peça para a pessoa trocar depois do primeiro acesso.</p>
    </div>
  );
}

export function CriarUsinaComConta() {
  const [estado, acao, enviando] = useActionState(criarUsinaComConta, undefined);
  return (
    <form action={acao} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome da usina">
          <input name="nome" required className="campo" placeholder="Usina Solar Planalto" />
        </Campo>
        <Campo rotulo="CNPJ ou CPF">
          <input name="documento" className="campo" />
        </Campo>
        <Campo rotulo="E-mail do dono">
          <input name="email" type="email" required className="campo" />
        </Campo>
        <Campo rotulo="Senha provisória" ajuda="Deixe em branco para gerar uma.">
          <input name="senha" className="campo" autoComplete="off" />
        </Campo>
      </div>
      <Botao disabled={enviando}>{enviando ? "Criando…" : "Criar usina e acesso"}</Botao>
      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado?.mensagem ? <MensagemAcesso texto={estado.mensagem} /> : null}
    </form>
  );
}

export function NovaSenha({ userId }: { userId: string }) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<{ erro?: string; mensagem?: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="w-full">
      {!r ? (
        confirmar ? (
          <span className="flex gap-3 text-sm">
            <button disabled={pendente} onClick={() => iniciar(async () => setR(await redefinirSenha(userId)))} className="text-erro hover:underline">
              Confirmar nova senha
            </button>
            <button onClick={() => setConfirmar(false)} className="text-nevoa">Cancelar</button>
          </span>
        ) : (
          <button onClick={() => setConfirmar(true)} className="text-sm text-sol hover:underline">Nova senha</button>
        )
      ) : r.erro ? (
        <Aviso tipo="erro">{r.erro}</Aviso>
      ) : (
        <MensagemAcesso texto={r.mensagem!} />
      )}
    </div>
  );
}

export function AdicionarOperador({ usinaId }: { usinaId: string }) {
  const [estado, acao, enviando] = useActionState(adicionarOperador.bind(null, usinaId), undefined);
  return (
    <form action={acao} className="space-y-3">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="email do operador" className="campo" />
        <Botao variante="secundario" disabled={enviando} className="shrink-0">Adicionar</Botao>
      </div>
      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado?.mensagem ? <MensagemAcesso texto={estado.mensagem} /> : null}
    </form>
  );
}

export function NovaTabelaCip() {
  const [estado, acao, enviando] = useActionState(criarTabelaCip, undefined);
  return (
    <form action={acao} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input name="municipio" required placeholder="Município" className="campo flex-1" />
        <input name="uf" defaultValue="BA" maxLength={2} className="campo w-20 uppercase" aria-label="UF" />
        <Botao variante="secundario" disabled={enviando} className="shrink-0">Cadastrar</Botao>
      </div>
      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : estado?.mensagem ? <Aviso tipo="ok">{estado.mensagem}</Aviso> : null}
    </form>
  );
}

export function NovaFaixaCip({ tabelaId }: { tabelaId: string }) {
  const [estado, acao, enviando] = useActionState(adicionarFaixaCip.bind(null, tabelaId), undefined);
  const [tipo, setTipo] = useState<"percentual" | "fixo">("percentual");
  return (
    <form action={acao} className="space-y-2 border-t border-traco pt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select name="classe" defaultValue="B1" className="campo py-1.5 text-sm" aria-label="Classe">
          {(Object.keys(CLASSES) as ClasseCip[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input name="consumo_min" inputMode="numeric" placeholder="de (kWh)" className="campo py-1.5 text-sm" />
        <input name="consumo_max" inputMode="numeric" placeholder="até (vazio = sem teto)" className="campo py-1.5 text-sm" />
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "percentual")} className="campo py-1.5 text-sm" aria-label="Tipo">
          <option value="percentual">%</option>
          <option value="fixo">R$</option>
        </select>
        <input name="valor" required inputMode="decimal" placeholder={tipo === "percentual" ? "7" : "30,00"} className="campo py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={enviando} className="text-sm text-sol hover:underline">Adicionar faixa</button>
        {estado?.erro ? <span className="text-xs text-erro">{estado.erro}</span> : null}
      </div>
    </form>
  );
}

export function RemoverFaixa({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button disabled={pendente} onClick={() => iniciar(() => removerFaixaCip(id))} className="text-xs text-nevoa hover:text-erro">
      Remover
    </button>
  );
}
