"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Send, Check } from "lucide-react";
import { reenviarBoasVindas } from "@/app/(app)/actions";
import { Aviso, Botao } from "./ui";

export function BotaoBoasVindasManual({
  clienteId,
  enviadaEm,
  temWhatsapp,
}: {
  clienteId: string;
  enviadaEm: string | null;
  temWhatsapp: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);

  if (!temWhatsapp) {
    return (
      <div className="space-y-2">
        <Botao variante="secundario" disabled className="w-full sm:w-auto text-xs opacity-60">
          <MessageSquare size={15} /> WhatsApp não cadastrado
        </Botao>
        <p className="text-xs text-alerta">Cadastre o WhatsApp do cliente para enviar as boas-vindas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Botao
        type="button"
        variante={enviadaEm ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => {
          setMsg(null);
          iniciar(async () => {
            const res = await reenviarBoasVindas(clienteId);
            setMsg(res);
          });
        }}
        className="w-full sm:w-auto text-sm"
      >
        {pendente ? (
          "Enviando pelo WhatsApp…"
        ) : enviadaEm ? (
          <>
            <Send size={15} /> Reenviar boas-vindas
          </>
        ) : (
          <>
            <Send size={15} /> Enviar boas-vindas no WhatsApp
          </>
        )}
      </Botao>

      {msg?.erro ? (
        <Aviso tipo="erro">{msg.erro}</Aviso>
      ) : msg?.ok ? (
        <Aviso tipo="ok">{msg.ok}</Aviso>
      ) : null}
    </div>
  );
}
