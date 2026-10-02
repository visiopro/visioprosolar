"use client";

import { useActionState, useState, useTransition } from "react";
import { convidarMembro, removerMembro, salvarCobranca, salvarLogo, salvarUsina, type Estado } from "@/app/(app)/actions";
import { PADRAO, VARIAVEIS } from "@/lib/boas-vindas";
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
      <fieldset disabled={!podeEditar} className="grid grid-cols-1 gap-5 disabled:opacity-70 sm:grid-cols-2">
        <Campo rotulo="Nome da usina" className="sm:col-span-2">
          <input name="nome" required defaultValue={usina.nome} className="campo" />
        </Campo>
        <Campo rotulo="CNPJ ou CPF">
          <input name="documento" defaultValue={usina.documento ?? ""} className="campo" />
        </Campo>
        <Campo
          rotulo="Bandeira tarifária (R$/kWh)"
          ajuda="Usada só quando a conta não traz a linha de bandeira. Quando traz, o app usa o valor da própria conta. Ex.: bandeira amarela ≈ 0,0254."
        >
          <input name="bandeira_padrao" inputMode="decimal" defaultValue={usina.bandeira_padrao ? String(usina.bandeira_padrao).replace(".", ",") : ""} placeholder="0,0254" className="campo" />
        </Campo>
        <Campo rotulo="Prazo de vencimento (dias)" ajuda="Contados a partir do lançamento da conta.">
          <input name="dias_vencimento" type="number" min={1} max={60} defaultValue={usina.dias_vencimento} className="campo" />
        </Campo>
        <Campo rotulo="WhatsApp de contato da usina" ajuda="Com DDD. É o número que o cliente aciona no portal quando precisa falar com gente.">
          <input name="contato_whatsapp" defaultValue={usina.contato_whatsapp?.replace(/^55/, "") ?? ""} inputMode="tel" className="campo" />
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
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" name="whatsapp_auto" defaultChecked={usina.whatsapp_auto} className="mt-0.5 h-4 w-4 accent-[var(--color-sol)]" />
            <span>
              Enviar a fatura no WhatsApp do cliente automaticamente ao emitir
              <span className="block text-xs text-nevoa">Vai o PDF, o código PIX e o link de pagamento. Clientes sem WhatsApp cadastrado ficam para envio manual.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset disabled={!podeEditar} className="rounded-[var(--radius-cartao)] border border-traco p-4 disabled:opacity-70">
        <legend className="px-1.5 text-sm font-medium">Boas-vindas do cliente</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="boas_vindas_ativo" defaultChecked={usina.boas_vindas_ativo} className="mt-0.5 h-4 w-4 accent-[var(--color-sol)]" />
          <span>
            Mandar uma mensagem no WhatsApp quando um cliente novo for cadastrado
            <span className="block text-xs text-nevoa">Explica como funciona e manda o link do portal dele. Clientes sem WhatsApp ficam de fora.</span>
          </span>
        </label>
        <Campo rotulo="Texto da mensagem" ajuda={`Em branco, usa o texto padrão. Variáveis: ${VARIAVEIS.map((v) => `{{${v}}}`).join(", ")}.`} className="mt-4">
          <textarea name="boas_vindas_texto" rows={10} defaultValue={usina.boas_vindas_texto ?? ""} placeholder={PADRAO} className="campo text-[13px]" />
        </Campo>
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

export function FormCobranca(p: { usina: Usina; asaasConfigurado: boolean; mpConfigurado: boolean; webhookUrl: string; webhookToken: string | null }) {
  const [estado, acao, enviando] = useActionState<Estado, FormData>(salvarCobranca, undefined);
  const [gateway, setGateway] = useState<Usina["gateway"]>(p.usina.gateway);
  const opcoes: { v: Usina["gateway"]; r: string; d: string }[] = [
    { v: "nenhum", r: "Desligada", d: "PIX fixo da usina e baixa manual." },
    { v: "asaas", r: "Asaas", d: "PIX dinâmico (e boleto/cartão, se quiser). Avisos por e-mail/SMS." },
    { v: "mercadopago", r: "Mercado Pago", d: "PIX dinâmico. Não precisa configurar webhook." },
  ];
  return (
    <form action={acao} className="space-y-5">
      <p className="text-sm leading-relaxed text-nevoa">
        Com a cobrança automática, cada fatura vira uma cobrança com PIX dinâmico. Quando o cliente paga, a fatura muda para paga sozinha e a taxa do serviço entra no financeiro.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {opcoes.map((o) => (
          <label key={o.v} className={`cursor-pointer rounded-[var(--radius-campo)] border px-3.5 py-3 ${gateway === o.v ? "border-sol bg-sol/5" : "border-traco"}`}>
            <input type="radio" name="gateway" value={o.v} checked={gateway === o.v} onChange={() => setGateway(o.v)} className="sr-only" />
            <span className="block text-[15px] font-medium">{o.r}</span>
            <span className="mt-0.5 block text-xs text-nevoa">{o.d}</span>
          </label>
        ))}
      </div>

      <div className={gateway === "asaas" ? "space-y-5" : "hidden"}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo rotulo="Ambiente" ajuda="Detectado pela chave quando ela começa com $aact_hmlg_ ou $aact_prod_.">
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
            rotulo="Chave de API do Asaas"
            className="sm:col-span-2"
            ajuda={p.asaasConfigurado ? "Já configurada. Cole uma nova só se quiser trocar." : "No Asaas: Integrações > Chave de API. Fica guardada só no servidor."}
          >
            <input name="asaas_api_key" type="password" autoComplete="off" placeholder={p.asaasConfigurado ? "••••••••••••" : "$aact_..."} className="campo" />
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
              Para a baixa automática, crie um webhook no Asaas (Integrações &gt; Webhooks) com os eventos de cobrança, usando:
            </p>
            <Copiavel rotulo="URL" valor={p.webhookUrl} />
            <Copiavel rotulo="Token de autenticação" valor={p.webhookToken} />
          </div>
        ) : null}
      </div>

      <div className={gateway === "mercadopago" ? "space-y-3" : "hidden"}>
        <Campo
          rotulo="Access Token do Mercado Pago"
          ajuda={
            p.mpConfigurado
              ? "Já configurado. Cole um novo só se quiser trocar."
              : "No Mercado Pago: Suas integrações > sua aplicação > Credenciais de produção > Access Token (começa com APP_USR-). Não use a Public Key."
          }
        >
          <input name="mp_access_token" type="password" autoComplete="off" placeholder={p.mpConfigurado ? "••••••••••••" : "APP_USR-..."} className="campo" />
        </Campo>
        <p className="text-xs text-nevoa">A baixa automática funciona sozinha: o app informa o endereço de aviso em cada cobrança. A conta precisa ter uma chave Pix cadastrada.</p>
      </div>

      {estado ? <Aviso tipo={estado.erro ? "erro" : "ok"}>{estado.erro ?? estado.ok}</Aviso> : null}
      <Botao disabled={enviando}>{enviando ? "Conectando…" : gateway === "nenhum" ? "Salvar" : "Salvar e testar conexão"}</Botao>
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
      <div className="grid h-24 w-40 place-items-center rounded-[var(--radius-campo)] border border-traco bg-white p-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Logo da usina" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-500">Sem logo</span>
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

/** Troca da própria senha: confere a senha atual antes de gravar a nova */
export function TrocarSenha({ email }: { email: string }) {
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const atual = String(f.get("atual") ?? "");
    const nova = String(f.get("nova") ?? "");
    if (nova.length < 8) return setMsg({ tipo: "erro", texto: "A nova senha precisa de pelo menos 8 caracteres." });
    if (nova !== f.get("confirmar")) return setMsg({ tipo: "erro", texto: "As senhas não conferem." });
    if (nova === atual) return setMsg({ tipo: "erro", texto: "A nova senha precisa ser diferente da atual." });

    setSalvando(true);
    setMsg(null);
    const supabase = supabaseBrowser();
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (erroLogin) {
      setSalvando(false);
      return setMsg({ tipo: "erro", texto: "Senha atual incorreta." });
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if (error) return setMsg({ tipo: "erro", texto: "Não foi possível trocar a senha. Tente de novo." });
    setMsg({ tipo: "ok", texto: "Senha alterada. Use a nova senha no próximo acesso." });
    (e.target as HTMLFormElement).reset();
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-sm text-sol hover:underline">
        Trocar minha senha
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo rotulo="Senha atual">
          <input name="atual" type="password" required autoComplete="current-password" className="campo" />
        </Campo>
        <Campo rotulo="Nova senha" ajuda="Mínimo de 8 caracteres.">
          <input name="nova" type="password" required autoComplete="new-password" className="campo" />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input name="confirmar" type="password" required autoComplete="new-password" className="campo" />
        </Campo>
      </div>
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <div className="flex gap-3">
        <Botao disabled={salvando}>{salvando ? "Salvando…" : "Salvar nova senha"}</Botao>
        <Botao type="button" variante="fantasma" onClick={() => { setAberto(false); setMsg(null); }}>
          Fechar
        </Botao>
      </div>
    </form>
  );
}
