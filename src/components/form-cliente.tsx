"use client";

import { useActionState, useState } from "react";
import { salvarCliente, type Estado } from "@/app/(app)/actions";
import { MODOS, type ModoDesconto } from "@/lib/calculo";
import { Aviso, Botao, Campo } from "./ui";

export type ClienteForm = {
  id?: string;
  nome?: string;
  documento?: string | null;
  uc?: string;
  distribuidora?: string;
  whatsapp?: string | null;
  email?: string | null;
  modo_desconto?: ModoDesconto;
  desconto_valor?: number;
};

const DISTRIBUIDORAS = ["Coelba (Neoenergia)", "Cemig", "Enel", "CPFL", "Light", "Equatorial", "Energisa", "Celesc", "Copel", "RGE"];

export function FormCliente({ c = {} }: { c?: ClienteForm }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarCliente, undefined);
  const [modo, setModo] = useState<ModoDesconto>(c.modo_desconto ?? "percentual_conta_cheia");

  return (
    <form action={acao} className="space-y-5">
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Nome ou razão social" className="sm:col-span-2">
          <input name="nome" required defaultValue={c.nome} className="campo" autoComplete="off" />
        </Campo>
        <Campo rotulo="CPF ou CNPJ">
          <input name="documento" defaultValue={c.documento ?? ""} className="campo" inputMode="numeric" />
        </Campo>
        <Campo rotulo="Unidade consumidora (UC)" ajuda="Número da instalação que aparece na conta.">
          <input name="uc" required defaultValue={c.uc} className="campo" inputMode="numeric" />
        </Campo>
        <Campo rotulo="Distribuidora">
          <input name="distribuidora" required list="distribuidoras" defaultValue={c.distribuidora ?? "Coelba (Neoenergia)"} className="campo" />
          <datalist id="distribuidoras">
            {DISTRIBUIDORAS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Campo>
        <Campo rotulo="WhatsApp" ajuda="Com DDD. Ex.: 77 99999-0000">
          <input name="whatsapp" defaultValue={c.whatsapp?.replace(/^55/, "") ?? ""} className="campo" inputMode="tel" />
        </Campo>
        <Campo rotulo="E-mail" className="sm:col-span-2">
          <input name="email" type="email" defaultValue={c.email ?? ""} className="campo" />
        </Campo>
      </div>

      <fieldset className="rounded-[var(--radius-cartao)] border border-traco p-4">
        <legend className="px-1.5 text-sm font-medium">Regra de cobrança</legend>
        <div className="grid gap-2">
          {(Object.keys(MODOS) as ModoDesconto[]).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer gap-3 rounded-[var(--radius-campo)] border px-3.5 py-3 ${modo === m ? "border-sol bg-sol/5" : "border-traco"}`}
            >
              <input type="radio" name="modo_desconto" value={m} checked={modo === m} onChange={() => setModo(m)} className="mt-1 accent-[var(--color-sol)]" />
              <span>
                <span className="block text-[15px]">{MODOS[m].rotulo}</span>
                <span className="block text-xs text-nevoa">{MODOS[m].ajuda}</span>
              </span>
            </label>
          ))}
        </div>
        <Campo rotulo={modo === "tarifa_fixa" ? "Tarifa da usina (R$ por kWh)" : "Desconto (%)"} className="mt-4 max-w-48">
          <input
            name="desconto_valor"
            required
            inputMode="decimal"
            defaultValue={c.desconto_valor !== undefined ? String(c.desconto_valor).replace(".", ",") : ""}
            placeholder={modo === "tarifa_fixa" ? "0,75" : "20"}
            className="campo"
          />
        </Campo>
      </fieldset>

      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Botao type="submit" disabled={enviando} className="w-full sm:w-auto">
        {enviando ? "Salvando…" : c.id ? "Salvar alterações" : "Cadastrar cliente"}
      </Botao>
    </form>
  );
}
