"use client";

import { useActionState, useState, useTransition } from "react";
import { convidarMembro, removerMembro, salvarAsaas, salvarLogo, salvarUsina, type Estado } from "@/app/(app)/actions";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Copy } from "lucide-react";
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
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm text-nevoa">WhatsApp</p>
          <p className="text-sm">
            {usina.whatsapp_instancia ? "Conectado. As faturas podem ser enviadas pelo WhatsApp." : "Não conectado. Fale com a VisioPro para conectar o número da usina."}
          </p>
        </div>
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

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm text-nevoa">{rotulo}</p>
      <div className="flex gap-2">
        <code className="campo block min-w-0 flex-1 truncate font-mono text-sm">{valor}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(valor);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          }}
          className="shrink-0 rounded-[var(--radius-campo)] border border-traco px-3 text-sm text-nevoa hover:text-texto"
        >
          {ok ? "Copiado" : <Copy size={16} aria-label="Copiar" />}
        </button>
      </div>
    </div>
  );
}

export function FormAsaas(p: { usina: Usina; chaveConfigurada: boolean; webhookUrl: string; webhookToken: string | null }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarAsaas, undefined);
  return (
    <form action={acao} className="space-y-5">
      <p className="text-sm leading-relaxed text-nevoa">
        Com o Asaas ligado, cada fatura emitida vira uma cobrança com PIX dinâmico. Quando o cliente paga, a fatura muda para paga sozinha e a taxa do Asaas entra no financeiro.
      </p>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="asaas_ativo" defaultChecked={p.usina.asaas_ativo} className="h-4 w-4 accent-[var(--color-sol)]" />
        <span>Cobrar pelo Asaas</span>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo rotulo="Ambiente" ajuda="Teste no sandbox antes de ir para produção.">
          <select name="asaas_ambiente" defaultValue={p.usina.asaas_ambiente} className="campo">
            <option value="sandbox">Sandbox (teste)</option>
            <option value="producao">Produção</option>
          </select>
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <select name="asaas_forma" defaultValue={p.usina.asaas_forma} className="campo">
            <option value="PIX">Só PIX</option>
            <option value="UNDEFINED">Cliente escolhe (PIX, boleto ou cartão)</option>
          </select>
        </Campo>
        <Campo
          rotulo="Chave de API"
          className="sm:col-span-2"
          ajuda={p.chaveConfigurada ? "Já configurada. Cole uma nova só se quiser trocar." : "No Asaas: Integrações > Chave de API. Ela é guardada só no servidor."}
        >
          <input name="asaas_api_key" type="password" autoComplete="off" placeholder={p.chaveConfigurada ? "••••••••••••" : "$aact_..."} className="campo" />
        </Campo>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="asaas_notificar" defaultChecked={p.usina.asaas_notificar} className="mt-0.5 h-4 w-4 accent-[var(--color-sol)]" />
        <span>
          O Asaas avisa o cliente (e-mail e SMS ao criar a cobrança, no vencimento e em atraso)
          <span className="block text-xs text-nevoa">O Asaas cobra por notificação enviada. Com isso ligado, o app não manda lembretes próprios no WhatsApp.</span>
        </span>
      </label>

      {p.webhookToken ? (
        <div className="space-y-3 rounded-[var(--radius-campo)] border border-traco p-4">
          <p className="text-sm">
            Para a baixa automática, crie um webhook no Asaas (Integrações &gt; Webhooks) com os eventos de <b className="font-medium">cobrança</b>, usando:
          </p>
          <Copiavel rotulo="URL" valor={p.webhookUrl} />
          <Copiavel rotulo="Token de autenticação" valor={p.webhookToken} />
        </div>
      ) : null}

      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
      <Botao disabled={enviando}>{enviando ? "Conectando…" : "Salvar e testar conexão"}</Botao>
    </form>
  );
}

/** Converte qualquer imagem em PNG de até 600px, mantendo a transparência */
async function prepararLogo(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Não foi possível processar a imagem.");
  if (blob.size > 2 * 1024 * 1024) throw new Error("A logo ficou maior que 2 MB. Use uma imagem mais simples.");
  return blob;
}

export function LogoUsina({ usinaId, url, podeEditar }: { usinaId: string; url: string | null; podeEditar: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return setErro("Envie uma imagem (PNG, JPG ou WebP).");
    setErro(null);
    setEnviando(true);
    try {
      const png = await prepararLogo(arquivo);
      const caminho = `${usinaId}/logo-${Date.now()}.png`;
      const { error } = await supabaseBrowser().storage.from("logos").upload(caminho, png, { contentType: "image/png" });
      if (error) throw new Error("Não foi possível enviar a logo.");
      const r = await salvarLogo(caminho);
      if (r.erro) throw new Error(r.erro);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setEnviando(true);
    const r = await salvarLogo(null);
    setEnviando(false);
    if (r.erro) setErro(r.erro);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex h-28 w-52 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-traco bg-painel p-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Logo da usina"
            className="max-h-22 max-w-full object-contain"
            style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span className="text-xs text-nevoa">Sem logo</span>
        )}
      </div>
      {podeEditar ? (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-campo)] border border-traco bg-relevo px-4 py-2.5 text-[15px] hover:border-nevoa">
            {enviando ? <Loader2 size={17} className="animate-spin" /> : <ImageUp size={17} />}
            {url ? "Trocar logo" : "Enviar logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviando} onChange={(e) => enviar(e.target.files?.[0])} />
          </label>
          {url ? (
            <button type="button" onClick={remover} disabled={enviando} className="block text-sm text-nevoa hover:text-erro">
              Remover logo
            </button>
          ) : null}
          <p className="text-xs text-nevoa">PNG com fundo transparente fica melhor. Aparece nas faturas.</p>
          {erro ? <p className="text-sm text-erro">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
