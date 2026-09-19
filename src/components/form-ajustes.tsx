"use client";

import { useActionState, useTransition } from "react";
import { convidarMembro, removerMembro, salvarUsina, type Estado } from "@/app/(app)/actions";
import type { Usina } from "@/lib/usina";
import { Aviso, Botao, Campo, Cartao } from "./ui";

export function FormUsina({ usina, podeEditar }: { usina: Usina; podeEditar: boolean }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarUsina, undefined);
  return (
    <form action={acao} className="space-y-5">
      <fieldset disabled={!podeEditar} className="grid gap-5 disabled:opacity-70 sm:grid-cols-2">
        <Campo rotulo="Nome da usina" className="sm:col-span-2">
          <input name="nome" required defaultValue={usina.nome} className="campo" />
        </Campo>
        <Campo rotulo="CNPJ ou CPF">
          <input name="documento" defaultValue={usina.documento ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Prazo de vencimento (dias)" ajuda="Contados a partir do lançamento da conta.">
          <input name="dias_vencimento" type="number" min={1} max={60} defaultValue={usina.dias_vencimento} className="campo" />
        </Campo>
        <Campo rotulo="Chave PIX" className="sm:col-span-2">
          <input name="pix_chave" defaultValue={usina.pix_chave ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Favorecido do PIX" ajuda="Como aparece no banco. Até 25 letras.">
          <input name="pix_favorecido" maxLength={25} defaultValue={usina.pix_favorecido ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Cidade do PIX" ajuda="Até 15 letras.">
          <input name="pix_cidade" maxLength={15} defaultValue={usina.pix_cidade ?? ""} className="campo" />
        </Campo>
        <Campo rotulo="Instância do WhatsApp" ajuda="Nome da instância conectada na Evolution API. Sem ela, o envio automático fica desligado." className="sm:col-span-2">
          <input name="whatsapp_instancia" defaultValue={usina.whatsapp_instancia ?? ""} className="campo" />
        </Campo>
      </fieldset>
      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
      {podeEditar ? (
        <Botao disabled={enviando}>{enviando ? "Salvando…" : "Salvar dados"}</Botao>
      ) : (
        <p className="text-sm text-nevoa">Só o dono da usina altera esses dados.</p>
      )}
    </form>
  );
}

export function Equipe({ membros, eu, dono }: { membros: { user_id: string; email: string | null; papel: string }[]; eu: string; dono: boolean }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(convidarMembro, undefined);
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao>
      <ul className="divide-y divide-traco">
        {membros.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0">
              <span className="block truncate">{m.email ?? "Usuário"}{m.user_id === eu ? " (você)" : ""}</span>
              <span className="text-xs text-nevoa">{m.papel === "dono" ? "Dono" : "Operador"}</span>
            </span>
            {dono && m.user_id !== eu ? (
              <button disabled={pendente} onClick={() => iniciar(() => removerMembro(m.user_id))} className="text-sm text-nevoa hover:text-erro">
                Remover
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {dono ? (
        <form action={acao} className="space-y-3 border-t border-traco p-5">
          <Campo rotulo="Convidar operador" ajuda="A pessoa recebe um e-mail para criar a senha. Operadores lançam contas e emitem faturas.">
            <div className="flex gap-2">
              <input name="email" type="email" required placeholder="email@exemplo.com" className="campo" />
              <Botao variante="secundario" disabled={enviando} className="shrink-0">
                Convidar
              </Botao>
            </div>
          </Campo>
          {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
        </form>
      ) : null}
    </Cartao>
  );
}
