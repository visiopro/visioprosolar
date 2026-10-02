"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { reenviarBoasVindas } from "@/app/(app)/actions";

export function CopiarPix({ pix }: { pix: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(pix);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-campo)] bg-sol px-4 py-3 font-semibold text-noite hover:bg-sol-forte"
    >
      <Copy size={18} /> {copiado ? "Código PIX copiado" : "Copiar código PIX"}
    </button>
  );
}

/** Link do portal do cliente, para copiar ou mandar no WhatsApp (uso interno da usina) */
export function LinkPortal({ url, whatsapp }: { url: string; whatsapp: string | null }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2">
      <code className="block truncate rounded-[var(--radius-campo)] border border-traco bg-noite px-3 py-2 font-mono text-xs">{url}</code>
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="text-sol hover:underline"
        >
          {copiado ? "Copiado" : "Copiar link"}
        </button>
        <a
          href={`https://wa.me/${whatsapp ?? ""}?text=${encodeURIComponent(`Aqui você acompanha suas faturas de energia solar e sua economia: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className="text-sol hover:underline"
        >
          Enviar no WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Chat de atendimento do portal */
export function ChatPortal({ token, whatsappUsina, usina }: { token: string; whatsappUsina: string | null; usina: string }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<{ papel: "cliente" | "atendente"; texto: string }[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || carregando) return;
    const novas = [...mensagens, { papel: "cliente" as const, texto: pergunta }];
    setMensagens(novas);
    setTexto("");
    setErro(null);
    setCarregando(true);
    try {
      const r = await fetch(`/api/portal/${token}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagens: novas }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.erro || "Não foi possível responder agora.");
      setMensagens([...novas, { papel: "atendente", texto: json.resposta }]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-6 w-full rounded-[var(--radius-campo)] border border-traco px-4 py-3 text-center hover:border-nevoa"
      >
        Tirar uma dúvida
      </button>
    );
  }

  return (
    <section className="mt-6 rounded-[var(--radius-cartao)] border border-traco bg-painel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-medium">Atendimento</p>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-nevoa hover:text-texto">
          Fechar
        </button>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
        {!mensagens.length ? (
          <p className="text-sm text-nevoa">
            Pergunte sobre sua fatura, o vencimento, como pagar ou como funciona a energia por assinatura.
          </p>
        ) : null}
        {mensagens.map((m, i) => (
          <p
            key={i}
            className={
              m.papel === "cliente"
                ? "ml-auto max-w-[85%] rounded-[var(--radius-campo)] bg-relevo px-3 py-2 text-sm"
                : "max-w-[90%] rounded-[var(--radius-campo)] border border-traco px-3 py-2 text-sm"
            }
          >
            {m.texto}
          </p>
        ))}
        {carregando ? <p className="text-sm text-nevoa">Digitando…</p> : null}
        {erro ? <p className="text-sm text-erro">{erro}</p> : null}
      </div>

      <form onSubmit={enviar} className="mt-3 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          placeholder="Escreva sua dúvida"
          className="campo"
          aria-label="Sua dúvida"
        />
        <button disabled={carregando || !texto.trim()} className="shrink-0 rounded-[var(--radius-campo)] bg-sol px-4 font-semibold text-noite disabled:opacity-50">
          Enviar
        </button>
      </form>

      {whatsappUsina ? (
        <a
          href={`https://wa.me/${whatsappUsina}?text=${encodeURIComponent(`Olá! Sou cliente da ${usina} e preciso de ajuda.`)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center text-sm text-sol hover:underline"
        >
          Falar com a usina no WhatsApp
        </a>
      ) : null}
      <p className="mt-3 text-center text-xs text-nevoa">
        Atendimento automático. Para valores oficiais, vale sempre a fatura em PDF.
      </p>
    </section>
  );
}

/** Reenvia a mensagem de boas-vindas para o cliente (uso interno da usina) */
export function ReenviarBoasVindas({ clienteId, enviadaEm }: { clienteId: string; enviadaEm: string | null }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs text-nevoa">
        {enviadaEm ? `Boas-vindas enviadas em ${new Date(enviadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "Boas-vindas ainda não enviadas."}
      </p>
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setMsg(await reenviarBoasVindas(clienteId)))}
        className="text-sm text-sol hover:underline disabled:opacity-50"
      >
        {enviadaEm ? "Enviar de novo" : "Enviar boas-vindas"}
      </button>
      {msg ? <p className={msg.erro ? "text-xs text-erro" : "text-xs text-economia"}>{msg.erro ?? msg.ok}</p> : null}
    </div>
  );
}

