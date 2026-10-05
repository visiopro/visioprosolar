"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Send } from "lucide-react";
import { enviarBoasVindasEmLote } from "@/app/(app)/actions";
import { Botao, Aviso } from "./ui";

export function DispararBoasVindasLote({ pendentesCount }: { pendentesCount: number }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);

  if (pendentesCount <= 0 && !msg) return null;

  return (
    <div className="mb-6 rounded-[var(--radius-cartao)] border border-sol/30 bg-sol/5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-sol/20 p-2 text-sol">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-texto">
              Boas-vindas pendentes ({pendentesCount})
            </h3>
            <p className="mt-0.5 text-xs text-nevoa">
              Existem {pendentesCount} cliente(s) ativo(s) com WhatsApp que ainda não receberam a mensagem de apresentação da usina.
            </p>
          </div>
        </div>
        <Botao
          type="button"
          variante="primario"
          disabled={pendente || pendentesCount === 0}
          onClick={() => {
            if (
              confirm(
                `Deseja enviar a mensagem de boas-vindas no WhatsApp para os ${pendentesCount} cliente(s) pendente(s)?`
              )
            ) {
              setMsg(null);
              iniciar(async () => {
                const res = await enviarBoasVindasEmLote();
                setMsg(res);
              });
            }
          }}
          className="shrink-0 text-sm"
        >
          <Send size={15} />
          {pendente ? "Enviando mensagens…" : `Enviar para todos (${pendentesCount})`}
        </Botao>
      </div>

      {msg?.erro ? (
        <div className="mt-3">
          <Aviso tipo="erro">{msg.erro}</Aviso>
        </div>
      ) : msg?.ok ? (
        <div className="mt-3">
          <Aviso tipo="ok">{msg.ok}</Aviso>
        </div>
      ) : null}
    </div>
  );
}
