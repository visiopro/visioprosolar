"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

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
