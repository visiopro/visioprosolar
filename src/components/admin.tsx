"use client";

import { useActionState, useState, useTransition } from "react";
import { definirInstancia, gerarConvite, revogarConvite } from "@/app/admin/actions";
import { Aviso, Botao } from "./ui";

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

export function Instancia({ usinaId, atual }: { usinaId: string; atual: string | null }) {
  const [estado, acao, enviando] = useActionState(definirInstancia.bind(null, usinaId), undefined);
  return (
    <form action={acao} className="flex items-center gap-2">
      <input name="instancia" defaultValue={atual ?? ""} placeholder="instância" className="campo w-40 py-1.5 text-sm" />
      <button disabled={enviando} className="text-sm text-sol hover:underline">Salvar</button>
      {estado?.erro ? <span className="text-xs text-erro">{estado.erro}</span> : estado?.ok ? <span className="text-xs text-economia">{estado.ok}</span> : null}
    </form>
  );
}
