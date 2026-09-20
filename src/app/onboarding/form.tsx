"use client";

import { useActionState } from "react";
import { criarUsina } from "./actions";
import { Aviso, Botao, Campo } from "@/components/ui";

export function FormOnboarding() {
  const [estado, acao, enviando] = useActionState(criarUsina, undefined);
  return (
    <form action={acao} className="mt-8 space-y-4">
      <Campo rotulo="Código de convite" ajuda="Enviado pela VisioPro. Ex.: ABCDE-23456">
        <input name="codigo" required autoComplete="off" className="campo uppercase tracking-wider" placeholder="XXXXX-XXXXX" />
      </Campo>
      <Campo rotulo="Nome da usina">
        <input name="nome" required className="campo" placeholder="Ex.: Usina Solar Planalto" />
      </Campo>
      <Campo rotulo="CNPJ ou CPF">
        <input name="documento" className="campo" inputMode="numeric" />
      </Campo>
      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Botao className="w-full" disabled={enviando}>
        {enviando ? "Cadastrando…" : "Cadastrar usina"}
      </Botao>
    </form>
  );
}
