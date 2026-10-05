"use client";

import { useActionState } from "react";
import { excluirCliente, type Estado } from "@/app/(app)/actions";
import { Aviso, Botao } from "./ui";

export function BotaoExcluirCliente({ id, nome }: { id: string; nome: string }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(excluirCliente, undefined);

  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm(`Tem certeza que deseja excluir o cliente "${nome}"? Esta ação removerá o cadastro permanentemente.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      {estado?.erro ? (
        <div className="mb-2">
          <Aviso tipo="erro">{estado.erro}</Aviso>
        </div>
      ) : null}
      <Botao variante="perigo" type="submit" disabled={enviando}>
        {enviando ? "Excluindo…" : "Excluir cliente"}
      </Botao>
    </form>
  );
}
