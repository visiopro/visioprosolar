"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { excluirDespesa, pagarDespesa, salvarDespesa, type Estado } from "@/app/(app)/actions";
import { CATEGORIAS } from "@/lib/financeiro";
import { Aviso, Botao, Campo, Cartao } from "./ui";

export function NovaDespesa({ hoje }: { hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [repetir, setRepetir] = useState("nenhuma");
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarDespesa, undefined);

  if (!aberto) {
    return (
      <Botao onClick={() => setAberto(true)}>
        <Plus size={17} /> Lançar despesa
      </Botao>
    );
  }
  return (
    <Cartao className="mb-6 w-full p-5">
      <form action={acao} className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Descrição" className="sm:col-span-2">
          <input name="descricao" required placeholder="Limpeza dos painéis" className="campo" />
        </Campo>
        <Campo rotulo="Categoria">
          <select name="categoria" defaultValue="manutencao" className="campo">
            {Object.entries(CATEGORIAS).map(([v, r]) => (
              <option key={v} value={v}>{r}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Valor (R$)">
          <input name="valor" required inputMode="decimal" placeholder="600,00" className="campo" />
        </Campo>
        <Campo rotulo="Vencimento">
          <input name="vencimento" type="date" required defaultValue={hoje} className="campo" />
        </Campo>
        <Campo rotulo="Repetir">
          <select name="repetir" value={repetir} onChange={(e) => setRepetir(e.target.value)} className="campo">
            <option value="nenhuma">Não repete</option>
            <option value="mensal">Todo mês</option>
            <option value="trimestral">A cada 3 meses</option>
            <option value="anual">Todo ano</option>
            <option value="parcelado">Parcelado</option>
          </select>
        </Campo>
        {repetir !== "nenhuma" ? (
          <Campo rotulo={repetir === "parcelado" ? "Número de parcelas" : "Quantas vezes lançar"} ajuda={repetir === "parcelado" ? undefined : "Até 24 lançamentos mensais ou 12 nos demais."}>
            <input name="vezes" type="number" min={2} max={120} defaultValue={repetir === "parcelado" ? 12 : repetir === "mensal" ? 12 : 4} className="campo" />
          </Campo>
        ) : null}
        <Campo rotulo="Observação" className="sm:col-span-2">
          <input name="observacao" className="campo" />
        </Campo>
        <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" name="paga" className="h-4 w-4 accent-[var(--color-sol)]" /> Já está paga
        </label>
        {estado ? <div className="sm:col-span-2"><Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso></div> : null}
        <div className="flex gap-2 sm:col-span-2">
          <Botao disabled={enviando}>{enviando ? "Salvando…" : "Salvar despesa"}</Botao>
          <Botao type="button" variante="fantasma" onClick={() => setAberto(false)}>Fechar</Botao>
        </div>
      </form>
    </Cartao>
  );
}

export function AcoesDespesa({ id, paga, serie }: { id: string; paga: boolean; serie: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  if (confirmar) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <button disabled={pendente} onClick={() => iniciar(() => excluirDespesa(id, false))} className="text-erro hover:underline">Só esta</button>
        {serie ? <button disabled={pendente} onClick={() => iniciar(() => excluirDespesa(id, true))} className="text-erro hover:underline">Esta e as próximas</button> : null}
        <button onClick={() => setConfirmar(false)} className="text-nevoa hover:text-texto">Manter</button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <button
        disabled={pendente}
        onClick={() => iniciar(() => pagarDespesa(id, !paga))}
        aria-label={paga ? "Desfazer pagamento" : "Marcar como paga"}
        title={paga ? "Desfazer pagamento" : "Marcar como paga"}
        className={paga ? "rounded-lg p-2 text-nevoa hover:text-texto" : "rounded-lg border border-economia/40 p-2 text-economia hover:bg-economia/10"}
      >
        {paga ? <Undo2 size={16} /> : <Check size={16} />}
      </button>
      {!paga ? (
        <button onClick={() => setConfirmar(true)} aria-label="Excluir" title="Excluir" className="rounded-lg p-2 text-nevoa hover:text-erro">
          <Trash2 size={16} />
        </button>
      ) : null}
    </span>
  );
}
