"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Download, ExternalLink, FileImage, Landmark, Loader2, Send } from "lucide-react";
import { cancelarFatura, enviarWhatsapp, gerarCobrancaAsaas, marcarPaga, type Estado } from "@/app/(app)/actions";
import { Aviso, Botao, Campo, Cartao } from "./ui";

export function AcoesFatura(p: {
  id: string;
  status: string;
  pix: string | null;
  podeEnviar: boolean;
  urlConta: string | null;
  asaasAtivo: boolean;
  asaasId: string | null;
  asaasLink: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [estado, cancelar, enviandoCancel] = useActionState<Estado, FormData>(cancelarFatura, undefined);
  const ativa = p.status !== "cancelada";

  return (
    <Cartao className="space-y-2.5 p-4">
      {ativa && p.podeEnviar ? (
        <Botao className="w-full" disabled={pendente} onClick={() => iniciar(async () => setMsg(await enviarWhatsapp(p.id)))}>
          {pendente ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Enviar no WhatsApp
        </Botao>
      ) : null}
      <a href={`/api/faturas/${p.id}/pdf`} target="_blank" className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-campo)] border border-traco bg-relevo px-4 py-2.5 hover:border-nevoa">
        <Download size={17} /> Abrir PDF
      </a>
      {p.pix && p.status === "pendente" ? (
        <Botao
          variante="secundario"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(p.pix!);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          <Copy size={17} /> {copiado ? "PIX copiado" : "Copiar PIX"}
        </Botao>
      ) : null}

      {p.asaasLink ? (
        <a href={p.asaasLink} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm text-sol hover:underline">
          <ExternalLink size={16} /> Página de pagamento (Asaas)
        </a>
      ) : p.asaasAtivo && p.status === "pendente" ? (
        <Botao variante="secundario" className="w-full" disabled={pendente} onClick={() => iniciar(async () => setMsg(await gerarCobrancaAsaas(p.id)))}>
          <Landmark size={17} /> Gerar cobrança no Asaas
        </Botao>
      ) : null}

      {p.urlConta ? (
        <a href={p.urlConta} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm text-nevoa hover:text-texto">
          <FileImage size={16} /> Ver conta original
        </a>
      ) : null}

      {ativa ? (
        <div className="border-t border-traco pt-3">
          <Botao
            variante="fantasma"
            className="w-full"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await marcarPaga(p.id, p.status !== "paga");
                setMsg(r.erro ? { erro: r.erro } : null);
              })
            }
          >
            {p.status === "paga" ? "Desfazer pagamento" : p.asaasId ? "Recebi por fora (dinheiro/transferência)" : "Marcar como paga"}
          </Botao>
          {p.status === "pendente" && !cancelando ? (
            <Botao variante="fantasma" className="w-full text-erro/80 hover:text-erro" onClick={() => setCancelando(true)}>
              Cancelar fatura
            </Botao>
          ) : null}
        </div>
      ) : null}

      {cancelando && p.status === "pendente" ? (
        <form action={cancelar} className="space-y-3 border-t border-traco pt-3">
          <input type="hidden" name="id" value={p.id} />
          <Campo
            rotulo="Motivo do cancelamento"
            ajuda={p.asaasId ? "A cobrança no Asaas também é excluída. Depois você pode lançar a conta de novo." : "Depois de cancelar, você pode lançar a conta de novo e emitir outra fatura."}
          >
            <textarea name="motivo" rows={2} required className="campo" />
          </Campo>
          <Botao variante="perigo" className="w-full" disabled={enviandoCancel}>
            Confirmar cancelamento
          </Botao>
        </form>
      ) : null}

      {msg ? <Aviso tipo={msg.erro ? "erro" : "ok"}>{msg.erro ?? msg.ok}</Aviso> : null}
      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
    </Cartao>
  );
}
