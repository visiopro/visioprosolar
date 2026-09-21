"use client";

import { useActionState, useState } from "react";
import { salvarCliente, type Estado } from "@/app/(app)/actions";
import { MODOS, type ModoDesconto } from "@/lib/calculo";
import { CLASSES, type ClasseCip } from "@/lib/cip";
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
  cip_modo?: "da_conta" | "percentual" | "fixo" | "tabela";
  cip_valor?: number;
  cip_tabela_id?: string | null;
  cip_classe?: ClasseCip | null;
};

export type TabelaCip = { id: string; municipio: string; uf: string };

const DISTRIBUIDORAS = ["Coelba (Neoenergia)", "Cemig", "Enel", "CPFL", "Light", "Equatorial", "Energisa", "Celesc", "Copel", "RGE"];

export function FormCliente({ c = {}, tabelas = [] }: { c?: ClienteForm; tabelas?: TabelaCip[] }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarCliente, undefined);
  const [modo, setModo] = useState<ModoDesconto>(c.modo_desconto ?? "percentual_conta_cheia");
  const [cip, setCip] = useState<NonNullable<ClienteForm["cip_modo"]>>(c.cip_modo ?? "da_conta");

  return (
    <form action={acao} className="space-y-5">
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-2">
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

      <fieldset className="rounded-[var(--radius-cartao)] border border-traco p-4">
        <legend className="px-1.5 text-sm font-medium">Iluminação pública (CIP)</legend>
        <p className="mb-3 text-xs text-nevoa">
          Na conta em nome da usina a CIP costuma vir como valor mínimo fixo. Aqui você diz quanto o cliente pagaria sem a usina.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { v: "da_conta" as const, r: "Usar o valor da conta", a: "Se a conta não tiver CIP, fica zero." },
            { v: "percentual" as const, r: "% sobre o valor da energia", a: "Municípios que cobram por faixa de consumo, como Vitória da Conquista." },
            { v: "fixo" as const, r: "Valor fixo por mês", a: "Quando o município cobra um valor fixo." },
            ...(tabelas.length ? [{ v: "tabela" as const, r: "Seguir a tabela do município", a: "O app escolhe a alíquota pela faixa de consumo do mês." }] : []),
          ].map((o) => (
            <label key={o.v} className={`flex cursor-pointer gap-3 rounded-[var(--radius-campo)] border px-3.5 py-3 ${cip === o.v ? "border-sol bg-sol/5" : "border-traco"}`}>
              <input type="radio" name="cip_modo" value={o.v} checked={cip === o.v} onChange={() => setCip(o.v)} className="mt-1 accent-[var(--color-sol)]" />
              <span>
                <span className="block text-[15px]">{o.r}</span>
                <span className="block text-xs text-nevoa">{o.a}</span>
              </span>
            </label>
          ))}
        </div>
        {cip === "tabela" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo rotulo="Município">
              <select name="cip_tabela_id" defaultValue={c.cip_tabela_id ?? ""} className="campo">
                <option value="">Selecione…</option>
                {tabelas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.municipio}/{t.uf}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Classe do cliente" ajuda="Aparece na conta, em “Classificação”.">
              <select name="cip_classe" defaultValue={c.cip_classe ?? "B1"} className="campo">
                {(Object.keys(CLASSES) as ClasseCip[]).map((k) => (
                  <option key={k} value={k}>
                    {CLASSES[k]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        ) : null}
        {cip === "percentual" || cip === "fixo" ? (
          <Campo rotulo={cip === "percentual" ? "Alíquota (%)" : "Valor (R$)"} className="mt-4 max-w-48">
            <input name="cip_valor" required inputMode="decimal" defaultValue={c.cip_valor ? String(c.cip_valor).replace(".", ",") : ""} placeholder={cip === "percentual" ? "7" : "30,00"} className="campo" />
          </Campo>
        ) : null}
      </fieldset>

      {estado?.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Botao type="submit" disabled={enviando} className="w-full sm:w-auto">
        {enviando ? "Salvando…" : c.id ? "Salvar alterações" : "Cadastrar cliente"}
      </Botao>
    </form>
  );
}
